use super::*;
use crate::models::{AgentEvidence, AgentHistoryItem, AiConfig, ProxyConfig};

fn fixture() -> AgentRequest {
    AgentRequest {
        message: "请解释当前报告".to_string(),
        conversation: vec![
            AgentMessage {
                role: "user".to_string(),
                content: "first".to_string(),
            },
            AgentMessage {
                role: "assistant".to_string(),
                content: "second".to_string(),
            },
        ],
        context: AgentContext {
            report_text: "# Current draft".to_string(),
            evidence: vec![],
            history: vec![],
        },
        ai: AiConfig {
            enabled: true,
            provider: "openai-compatible".to_string(),
            base_url: "http://127.0.0.1".to_string(),
            model: "fixture".to_string(),
            api_key: "sk-fixture".to_string(),
            temperature: 0.2,
            timeout_seconds: 1,
            proxy: ProxyConfig::default(),
        },
    }
}

#[test]
fn conversation_stays_chronological_and_current_report_is_supplied() {
    let request = fixture();
    let answer = run_with(&request, |prompt| {
        let value: serde_json::Value = serde_json::from_str(prompt).unwrap();
        assert_eq!("first", value["conversation"][0]["content"]);
        assert_eq!("second", value["conversation"][1]["content"]);
        assert_eq!(request.message, value["conversation"][2]["content"]);
        assert_eq!(request.context.report_text, value["currentReport"]);
        assert!(!prompt.contains("sk-fixture"));
        Ok(r#"{"kind":"answer","text":"A grounded answer"}"#.to_string())
    })
    .unwrap();
    assert_eq!("A grounded answer", answer.answer);
    assert!(answer.patch.is_none());
}

#[test]
fn tool_result_is_only_supplied_after_the_model_requests_it() {
    let mut request = fixture();
    request.context.evidence.push(AgentEvidence {
        project_name: "Portal".to_string(),
        branch_name: "main".to_string(),
        date: "2026-09-10".to_string(),
        hash: "abc".to_string(),
        message: "EVIDENCE_ONLY".to_string(),
    });
    request.context.history.push(AgentHistoryItem {
        title: "earlier".to_string(),
        period_label: "prior".to_string(),
        report_text: "HISTORY_ONLY".to_string(),
    });
    let mut step = 0;
    let response = run_with(&request, |prompt| {
        step += 1;
        assert!(!prompt.contains("HISTORY_ONLY"));
        if step == 1 {
            assert!(!prompt.contains("EVIDENCE_ONLY"));
            Ok(
                r#"{"kind":"tool_call","tool":"current_evidence","query":"EVIDENCE_ONLY"}"#
                    .to_string(),
            )
        } else {
            assert!(prompt.contains("EVIDENCE_ONLY"));
            Ok(r#"{"kind":"answer","text":"Based on supplied evidence"}"#.to_string())
        }
    })
    .unwrap();
    assert_eq!(2, step);
    assert_eq!(vec!["current_evidence"], response.tool_trace);
}

#[test]
fn report_changes_are_returned_as_proposals() {
    let request = fixture();
    let response = run_with(&request, |_| Ok(r##"{"kind":"report_patch","text":"Edit summary","patch":{"mode":"replace","content":"# Proposed draft","reason":"Shorter wording"}}"##.to_string())).unwrap();
    assert_eq!("# Proposed draft", response.patch.unwrap().content);
    assert_eq!("# Current draft", request.context.report_text);
}

#[test]
fn tool_loop_is_bounded_and_unknown_or_repeated_tools_stop_execution() {
    let request = fixture();
    let mut calls = 0;
    let result = run_with(&request, |_| {
        calls += 1;
        Ok(
            json!({ "kind": "tool_call", "tool": "current_evidence", "query": calls.to_string() })
                .to_string(),
        )
    });
    assert!(result.unwrap_err().contains("限定步骤"));
    assert_eq!(MAX_STEPS, calls);
    assert!(run_with(&request, |_| Ok(
        r#"{"kind":"tool_call","tool":"shell"}"#.to_string()
    ))
    .unwrap_err()
    .contains("不支持"));
    assert!(run_with(&request, |_| Ok(
        r#"{"kind":"tool_call","tool":"current_report"}"#.to_string()
    ))
    .unwrap_err()
    .contains("重复"));
}

#[test]
fn oversized_context_and_invalid_roles_fail_before_any_network_call() {
    let mut request = fixture();
    request.context.report_text = "中".repeat(MAX_PATCH_CHARS + 1);
    assert!(run_with(&request, |_| panic!("must not call provider")).is_err());
    request = fixture();
    request.conversation[0].role = "system".to_string();
    assert!(run_with(&request, |_| panic!("must not call provider")).is_err());
    request = fixture();
    request.ai.enabled = false;
    assert!(run_with(&request, |_| panic!("must not call provider")).is_err());
}

#[test]
fn malformed_and_empty_provider_outputs_never_produce_a_patch() {
    for raw in [
        "not JSON",
        r#"{"kind":"answer","text":" "}"#,
        r#"{"kind":"report_patch"}"#,
        r#"{"kind":"report_patch","patch":{"mode":"replace","content":"","reason":"oops"}}"#,
    ] {
        assert!(run_with(&fixture(), |_| Ok(raw.to_string())).is_err());
    }
    let patch = AgentPatch {
        mode: "append".to_string(),
        content: "x".repeat(MAX_PATCH_CHARS),
        reason: "extra".to_string(),
    };
    assert!(validate_patch(&patch, "existing").is_err());
}
