use crate::models::{AiConfig, AiModelInfo};
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::{collections::HashSet, time::Duration};

/// Anthropic 默认输出上限：覆盖主流 Claude 模型的单次输出额度。
const ANTHROPIC_MAX_TOKENS: u32 = 8_192;
/// 少数模型只接受 4096（例如 claude-3-haiku 系列），按其报错回退一次。
const ANTHROPIC_FALLBACK_MAX_TOKENS: u32 = 4_096;
/// 输出被模型上限截断时必须显式报错：截断的 Markdown / JSON 只会让上层
/// 误报成"无法识别的结构化结果"，用户也无从知道要缩短报告。
const TRUNCATED_OUTPUT_ERROR: &str =
    "AI 输出被截断：已达到该模型的单次输出上限。请缩短报告，或改用输出上限更高的模型后重试。";

pub fn enhance_monthly_report(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
    system_prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    let prompt = monthly_user_prompt(
        base_report,
        start_date,
        end_date,
        author,
        refinement_instruction,
    );
    enhance_report(
        base_report,
        resolve_system_prompt(system_prompt, monthly_system_prompt()),
        &prompt,
        config,
    )
}

pub fn enhance_weekly_report(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
    system_prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    let prompt = weekly_user_prompt(
        base_report,
        start_date,
        end_date,
        author,
        refinement_instruction,
    );
    enhance_report(
        base_report,
        resolve_system_prompt(system_prompt, weekly_system_prompt()),
        &prompt,
        config,
    )
}

pub fn enhance_daily_report(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
    system_prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    let prompt = daily_user_prompt(
        base_report,
        start_date,
        end_date,
        author,
        refinement_instruction,
    );
    enhance_report(
        base_report,
        resolve_system_prompt(system_prompt, daily_system_prompt()),
        &prompt,
        config,
    )
}

pub fn fill_blank_day_report(
    base_evidence: &str,
    target_date: &str,
    source_start_date: &str,
    source_end_date: &str,
    author: &str,
    item_count: u32,
    user_prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    if !config.enabled {
        return Err("请先启用并配置 AI".to_string());
    }
    if base_evidence.trim().is_empty() {
        return Err("素材周期内没有可用的提交线索".to_string());
    }
    let count = item_count.clamp(1, 8);
    let prompt = blank_day_user_prompt(
        base_evidence,
        target_date,
        source_start_date,
        source_end_date,
        author,
        count,
        user_prompt,
    );
    enhance_report(base_evidence, blank_day_system_prompt(), &prompt, config)
}

/// 自定义系统提示词非空则采用它，否则回退内置默认。默认字符串保留为同源参照与兜底。
fn resolve_system_prompt<'a>(custom: &'a str, fallback: &'a str) -> &'a str {
    if custom.trim().is_empty() {
        fallback
    } else {
        custom
    }
}

pub fn list_models(config: &AiConfig) -> Result<Vec<AiModelInfo>, String> {
    if config.provider == "codex-oauth" {
        return crate::codex_oauth::list_models(&config.proxy);
    }
    validate_model_list_config(config)?;
    let api_key = read_api_key(config)?;
    let url = format!("{}/models", config.base_url.trim_end_matches('/'));
    let request = http_client(config)?.get(url);
    let request = if config.provider == "anthropic-native" {
        request
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
    } else {
        request.bearer_auth(api_key)
    };

    parse_model_list_response(parse_json_response(
        request.send().map_err(|err| err.to_string())?,
    )?)
}

fn enhance_report(
    base_report: &str,
    system_prompt: &str,
    prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    if !config.enabled {
        return Ok(base_report.to_string());
    }

    validate_config(config)?;
    if config.provider == "codex-oauth" {
        return crate::codex_oauth::enhance(system_prompt, prompt, &config.model, &config.proxy);
    }
    let api_key = read_api_key(config)?;
    match config.provider.as_str() {
        "anthropic-native" => enhance_with_anthropic(config, &api_key, prompt, system_prompt),
        _ => enhance_with_openai_compatible(config, &api_key, prompt, system_prompt),
    }
}

/// Provider-neutral chat entry point for bounded Agent orchestration.
/// The caller owns protocol validation; this function only reuses credential,
/// proxy, timeout and provider transport behavior shared with polishing.
pub fn complete_chat(
    config: &AiConfig,
    system_prompt: &str,
    prompt: &str,
) -> Result<String, String> {
    if !config.enabled {
        return Err("请先启用并配置 AI".to_string());
    }
    validate_config(config)?;
    if config.provider == "codex-oauth" {
        return crate::codex_oauth::enhance(system_prompt, prompt, &config.model, &config.proxy);
    }
    let api_key = read_api_key(config)?;
    match config.provider.as_str() {
        "anthropic-native" => enhance_with_anthropic(config, &api_key, prompt, system_prompt),
        _ => enhance_with_openai_compatible(config, &api_key, prompt, system_prompt),
    }
}

fn validate_config(config: &AiConfig) -> Result<(), String> {
    if config.model.trim().is_empty() {
        return Err("未配置 AI 模型名".to_string());
    }
    if config.provider != "codex-oauth" && config.base_url.trim().is_empty() {
        return Err("未配置 AI Base URL".to_string());
    }
    Ok(())
}

fn validate_model_list_config(config: &AiConfig) -> Result<(), String> {
    if config.base_url.trim().is_empty() {
        return Err("未配置 AI Base URL".to_string());
    }
    Ok(())
}

fn read_api_key(config: &AiConfig) -> Result<String, String> {
    let value = config.api_key.trim();
    if value.is_empty() {
        return Err("未提供 API Key".to_string());
    }
    if let Some(name) = value.strip_prefix("env:") {
        let name = name.trim();
        if name.is_empty() {
            return Err(
                "API Key 环境变量引用缺少变量名，请填写 env:OPENAI_API_KEY 这类格式。".to_string(),
            );
        }
        return read_api_key_from_env(name);
    }
    if looks_like_env_var_name(value) {
        return read_api_key_from_env(value);
    }
    Ok(value.to_string())
}

fn read_api_key_from_env(name: &str) -> Result<String, String> {
    if !looks_like_env_var_name(name) {
        return Err(format!(
            "环境变量名格式不正确：{name}。请使用 OPENAI_API_KEY 或 env:OPENAI_API_KEY 这类格式。"
        ));
    }
    std::env::var(name)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "环境变量 {name} 未设置或为空。请在系统环境变量中配置它，或在设置里直接填写 API Key。"
            )
        })
}

fn looks_like_env_var_name(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

fn enhance_with_openai_compatible(
    config: &AiConfig,
    api_key: &str,
    prompt: &str,
    system_prompt: &str,
) -> Result<String, String> {
    let payload = json!({
        "model": config.model,
        "temperature": config.temperature,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
        ]
    });
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let response = http_client(config)?
        .post(url)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .map_err(|err| err.to_string())?;
    parse_openai_response(parse_json_response(response)?)
}

fn enhance_with_anthropic(
    config: &AiConfig,
    api_key: &str,
    prompt: &str,
    system_prompt: &str,
) -> Result<String, String> {
    // Anthropic 必须显式声明输出上限。4096 对长报告改稿偏小（Agent 侧允许
    // 20k 字符的 patch），默认使用主流 Claude 模型都接受的 8192；只有模型明确
    // 拒绝该值时，才回退到历史最小值重试一次。
    let first = anthropic_messages(config, api_key, prompt, system_prompt, ANTHROPIC_MAX_TOKENS);
    match first {
        Err(err) if err.contains("max_tokens") => anthropic_messages(
            config,
            api_key,
            prompt,
            system_prompt,
            ANTHROPIC_FALLBACK_MAX_TOKENS,
        ),
        other => other,
    }
}

fn anthropic_messages(
    config: &AiConfig,
    api_key: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: u32,
) -> Result<String, String> {
    let payload = json!({
        "model": config.model,
        "max_tokens": max_tokens,
        "temperature": config.temperature,
        "system": system_prompt,
        "messages": [{ "role": "user", "content": prompt }]
    });
    let url = format!("{}/messages", config.base_url.trim_end_matches('/'));
    let response = http_client(config)?
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send()
        .map_err(|err| err.to_string())?;
    parse_anthropic_response(parse_json_response(response)?)
}

fn http_client(config: &AiConfig) -> Result<Client, String> {
    crate::network::client(
        Duration::from_secs(config.timeout_seconds.max(1)),
        &config.proxy,
    )
}

fn parse_json_response(response: reqwest::blocking::Response) -> Result<Value, String> {
    let status = response.status();
    let value = response.json::<Value>().map_err(|err| err.to_string())?;
    if status.is_success() {
        return Ok(value);
    }
    Err(format!("AI 服务返回错误 {}：{}", status, value))
}

fn parse_openai_response(response: Value) -> Result<String, String> {
    if response["choices"][0]["finish_reason"].as_str() == Some("length") {
        return Err(TRUNCATED_OUTPUT_ERROR.to_string());
    }
    response["choices"][0]["message"]["content"]
        .as_str()
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| "AI 服务返回空内容".to_string())
}

fn parse_anthropic_response(response: Value) -> Result<String, String> {
    if response["stop_reason"].as_str() == Some("max_tokens") {
        return Err(TRUNCATED_OUTPUT_ERROR.to_string());
    }
    let blocks = response["content"]
        .as_array()
        .ok_or_else(|| "AI 服务返回内容格式不正确".to_string())?;
    let content = blocks
        .iter()
        .filter_map(|block| block["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if content.is_empty() {
        return Err("AI 服务返回空内容".to_string());
    }
    Ok(content)
}

fn parse_model_list_response(response: Value) -> Result<Vec<AiModelInfo>, String> {
    let candidates = response
        .get("data")
        .or_else(|| response.get("models"))
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| response.as_array().cloned())
        .ok_or_else(|| "AI 服务返回的模型列表格式不正确".to_string())?;
    let mut seen = HashSet::new();
    let mut models = candidates
        .iter()
        .filter_map(extract_model_id)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .filter(|id| seen.insert((*id).to_string()))
        .map(|id| AiModelInfo { id: id.to_string() })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.to_lowercase().cmp(&right.id.to_lowercase()));
    if models.is_empty() {
        return Err("AI 服务未返回可用模型".to_string());
    }
    Ok(models)
}

fn extract_model_id(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
        .or_else(|| value.get("name").and_then(Value::as_str))
}

fn monthly_system_prompt() -> &'static str {
    "你是一个严谨的绩效月报写作助手。请基于 Git 提交月报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：项目进度、实际完成情况、当月总结。每个模块下必须继续按照项目分组。"
}

fn weekly_system_prompt() -> &'static str {
    "你是一个严谨的工作周报写作助手。请基于 Git 提交周报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：本周重点、实际完成情况、下周关注。每个模块尽量保留项目分组和可追溯事项。"
}

fn daily_system_prompt() -> &'static str {
    "你是一个严谨的工作日报写作助手。请基于 Git 提交记录润色为当天或指定周期的工作日报，不要虚构没有依据的业务结果、上线结论或百分比。最终输出保持为简洁纯文本或短列表，方便直接复制到工作汇报中。"
}

fn blank_day_system_prompt() -> &'static str {
    "你是一个基于历史代码证据推断下一步工作的日报草稿助手。请仅根据用户提供的历史 Git 提交线索，为目标日撰写可编辑的延续要点。每条必须引用至少一个历史线索中的具体锚点，例如已有功能、接口、数据流、页面、脚本、测试、异常路径或技术对象，并给出最可能发生的代码级动作。优先选择功能延伸、缺陷或回归修复、异常与边界处理、兼容性完善、测试补强，或衔接历史中已出现的接口与数据流。可以提出潜在缺陷的修复动作，但不得断言已发现或已修复线索中没有给出的故障。不得只写跟进、排查、推进、联调、整理等空泛过程词；如确需使用，必须同时写清具体对象、问题模式和拟采取的动作。多条输出应覆盖不同历史锚点或不同具体动作，避免同义改写。禁止编造上线、验收、业务结果、百分比进度或从未出现过的模块，也不得把草稿伪装成目标日真实提交。若线索条目已带项目前缀（如「映射项目名 - 」或「仓库(分支) - 」），输出每条必须保留同风格前缀，与用户日常日报一致。最终只输出短要点列表，不要长文复盘。"
}

fn blank_day_user_prompt(
    base_evidence: &str,
    target_date: &str,
    source_start_date: &str,
    source_end_date: &str,
    author: &str,
    item_count: u32,
    user_prompt: &str,
) -> String {
    let instruction = if user_prompt.trim().is_empty() {
        "无额外要求"
    } else {
        user_prompt.trim()
    };
    format!(
        "目标日：{}\n素材周期：{} 至 {}\n作者：{}\n需要输出条数：{}\n用户要求：{}\n\n请严格输出恰好 {} 条短要点列表（每行一条，使用 - 前缀）。每条一句话，并从下列历史提交线索中提取明确的具体锚点，再写最可能发生的代码级延续。优先写功能延伸、缺陷或回归修复、异常/边界/兼容性处理、测试补强，或已有接口与数据流的衔接；不得只写「跟进、排查、推进、联调、整理」等过程性表态。若写潜在缺陷，应描述拟补充的保护或修复动作，不得声称故障已经发生。不同条目尽量对应不同历史线索或不同动作，避免同义改写。不要写成目标日真实提交记录，不要添加无法核实的结论。若线索中带有项目前缀（例如「柏科注安工程师 - 」），输出必须沿用该前缀风格，写成「- 项目名 - 具体延续事项」。\n\n历史提交线索：\n{}",
        target_date,
        source_start_date,
        source_end_date,
        if author.is_empty() { "全部作者" } else { author },
        item_count,
        instruction,
        item_count,
        base_evidence
    )
}

fn monthly_user_prompt(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
) -> String {
    let instruction = if refinement_instruction.trim().is_empty() {
        "无"
    } else {
        refinement_instruction.trim()
    };
    format!(
        "统计周期：{} 至 {}\n作者：{}\n用户补充/修改要求：{}\n\n请把下面的月报草稿润色为适合绩效考核提交的正式月报。要求语气客观、具体、不过度夸大；保留项目分组；实际完成情况必须贴合提交记录。\n\n{}",
        start_date,
        end_date,
        if author.is_empty() { "全部作者" } else { author },
        instruction,
        base_report
    )
}

fn weekly_user_prompt(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
) -> String {
    let instruction = if refinement_instruction.trim().is_empty() {
        "无"
    } else {
        refinement_instruction.trim()
    };
    format!(
        "统计周期：{} 至 {}\n作者：{}\n用户补充/修改要求：{}\n\n请把下面的周报草稿润色为适合周工作汇报的正式周报。要求语气客观、具体、不过度夸大；保留项目分组；本周重点和完成情况必须贴合提交记录，下周关注只能基于已完成事项自然延伸。\n\n{}",
        start_date,
        end_date,
        if author.is_empty() { "全部作者" } else { author },
        instruction,
        base_report
    )
}

fn daily_user_prompt(
    base_report: &str,
    start_date: &str,
    end_date: &str,
    author: &str,
    refinement_instruction: &str,
) -> String {
    let instruction = if refinement_instruction.trim().is_empty() {
        "无"
    } else {
        refinement_instruction.trim()
    };
    format!(
        "统计周期：{} 至 {}\n作者：{}\n用户补充/修改要求：{}\n\n请把下面的 Git 提交摘要润色为工作日报。要求保留可追溯的事项，不添加提交记录之外的事实；语言简洁、正式，适合直接复制到日报；如果内容较多，请按项目或事项分组。\n\n{}",
        start_date,
        end_date,
        if author.is_empty() { "全部作者" } else { author },
        instruction,
        base_report
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_day_prompts_require_concrete_history_anchors() {
        let prompt = blank_day_user_prompt(
            "- repo: fix login",
            "2026-07-14",
            "2026-07-11",
            "2026-07-13",
            "alice",
            5,
            "偏跟进",
        );
        assert!(prompt.contains("需要输出条数：5"));
        assert!(prompt.contains("恰好 5 条"));
        assert!(prompt.contains("fix login"));
        assert!(prompt.contains("项目前缀"));
        assert!(prompt.contains("具体锚点"));
        assert!(prompt.contains("功能延伸"));
        assert!(prompt.contains("缺陷或回归"));
        assert!(prompt.contains("测试补强"));
        assert!(prompt.contains("不得只写"));
        let system_prompt = blank_day_system_prompt();
        assert!(system_prompt.contains("项目前缀"));
        assert!(system_prompt.contains("具体锚点"));
        assert!(system_prompt.contains("功能延伸"));
        assert!(system_prompt.contains("缺陷或回归"));
        assert!(system_prompt.contains("测试补强"));
        assert!(!system_prompt.contains("优先使用跟进、排查、推进、联调、整理"));
    }

    #[test]
    fn parse_openai_response_reads_message_content() {
        let response = json!({
            "choices": [{ "message": { "content": "  refined report  " } }]
        });

        assert_eq!(parse_openai_response(response).unwrap(), "refined report");
    }

    #[test]
    fn parse_openai_response_reports_length_truncation() {
        let response = json!({
            "choices": [{ "finish_reason": "length", "message": { "content": "half a rep" } }]
        });

        let err = parse_openai_response(response).unwrap_err();

        assert!(err.contains("输出被截断"), "unexpected error: {err}");
    }

    #[test]
    fn parse_anthropic_response_reports_max_tokens_truncation() {
        let response = json!({
            "stop_reason": "max_tokens",
            "content": [{ "type": "text", "text": "half a rep" }]
        });

        let err = parse_anthropic_response(response).unwrap_err();

        assert!(err.contains("输出被截断"), "unexpected error: {err}");
    }

    #[test]
    fn parse_anthropic_response_accepts_normal_stop_reason() {
        let response = json!({
            "stop_reason": "end_turn",
            "content": [{ "type": "text", "text": "complete report" }]
        });

        assert_eq!(
            parse_anthropic_response(response).unwrap(),
            "complete report"
        );
    }

    #[test]
    fn parse_anthropic_response_joins_text_blocks() {
        let response = json!({
            "content": [
                { "type": "text", "text": "first" },
                { "type": "text", "text": "second" }
            ]
        });

        assert_eq!(parse_anthropic_response(response).unwrap(), "first\nsecond");
    }

    #[test]
    fn parse_model_list_response_reads_openai_data() {
        let response = json!({
            "data": [
                { "id": "gpt-4.1-mini" },
                { "id": "gpt-4.1" }
            ]
        });

        let models = parse_model_list_response(response).unwrap();

        assert_eq!(
            models.into_iter().map(|model| model.id).collect::<Vec<_>>(),
            vec!["gpt-4.1", "gpt-4.1-mini"]
        );
    }

    #[test]
    fn parse_model_list_response_accepts_string_arrays() {
        let response = json!({ "models": ["z-model", "a-model", "a-model"] });

        let models = parse_model_list_response(response).unwrap();

        assert_eq!(
            models.into_iter().map(|model| model.id).collect::<Vec<_>>(),
            vec!["a-model", "z-model"]
        );
    }

    #[test]
    fn read_api_key_accepts_direct_api_key() {
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: "test-direct-api-key".to_string(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        assert_eq!(read_api_key(&config).unwrap(), "test-direct-api-key");
    }

    #[test]
    fn read_api_key_accepts_env_var_reference() {
        std::env::set_var("GITPULSE_TEST_AI_KEY", "test-env-api-key");
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: "GITPULSE_TEST_AI_KEY".to_string(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        assert_eq!(read_api_key(&config).unwrap(), "test-env-api-key");
        std::env::remove_var("GITPULSE_TEST_AI_KEY");
    }

    #[test]
    fn read_api_key_accepts_prefixed_env_var_reference() {
        std::env::set_var("GITPULSE_TEST_AI_KEY_PREFIXED", "test-env-api-key-prefixed");
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: "env:GITPULSE_TEST_AI_KEY_PREFIXED".to_string(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        assert_eq!(read_api_key(&config).unwrap(), "test-env-api-key-prefixed");
        std::env::remove_var("GITPULSE_TEST_AI_KEY_PREFIXED");
    }

    #[test]
    fn read_api_key_requires_direct_api_key() {
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: String::new(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        assert_eq!(read_api_key(&config).unwrap_err(), "未提供 API Key");
    }

    #[test]
    fn read_api_key_explains_missing_prefixed_env_var_name() {
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: "env:".to_string(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        let message = read_api_key(&config).unwrap_err();

        assert!(message.contains("缺少变量名"));
        assert!(message.contains("env:OPENAI_API_KEY"));
    }

    #[test]
    fn read_api_key_explains_missing_env_var() {
        std::env::remove_var("GITPULSE_TEST_MISSING_AI_KEY");
        let config = AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            api_key: "GITPULSE_TEST_MISSING_AI_KEY".to_string(),
            temperature: 0.2,
            timeout_seconds: 60,
            proxy: Default::default(),
        };

        let message = read_api_key(&config).unwrap_err();

        assert!(message.contains("GITPULSE_TEST_MISSING_AI_KEY"));
        assert!(message.contains("直接填写 API Key"));
    }
}
