# GitPulse Context

GitPulse helps developers turn local Git activity into trustworthy work reports. This glossary defines the product language used when planning, grilling, and reviewing changes.

## Language

**Workspace Directory**:
The folder a user chooses as the starting point for discovering Git repositories. One workspace directory can contain zero, one, or many repositories.
_Avoid_: root path, scan folder, code folder

**Repository**:
A local Git project found under a workspace directory and eligible for report generation. A repository has a current branch and can be enabled or disabled for a report.
_Avoid_: project, repo item

**Repository Index**:
The remembered list of discovered repositories for the current workspace directory set. It represents the user's current selectable source set, not the final report.
_Avoid_: scan result, repo cache

**Author Scope**:
The person or people whose commits should be included in a report. Empty author scope means all authors, not an unknown author.
_Avoid_: user filter, owner

**Report Period**:
The date span used to select commits for a report. Daily, weekly, monthly, and custom reports are different report types that all have a report period.
_Avoid_: date filter, time range

**Report Draft**:
The locally generated report text before optional AI polishing. A report draft must remain useful even when AI polishing is unavailable.
_Avoid_: raw output, summary text

**AI Polishing**:
An optional rewriting step that improves a report draft without inventing unsupported outcomes. AI polishing may fail without blocking local report generation.
_Avoid_: AI generation, cloud report

**Report Assistant**:
A conversational, read-only tool in the report sidebar that answers questions about the current report and offers change suggestions. It reads the current report, optional commit evidence, and only explicitly selected historical reports through read-only tools; it never writes the report itself and never accesses files, terminals, or network beyond the configured AI provider. Its output is advisory.
_Avoid_: AI report generator, auto-rewriter, chatbot that saves files

**Report Patch**:
A proposed replacement or addition to the report produced by the Report Assistant. A patch changes nothing until the user opens the review comparison and explicitly accepts it; accepting applies it to the working report text, rejecting or editing leaves the original untouched.
_Avoid_: AI-saved result, auto-applied edit

**Local Editing**:
Direct Markdown editing of a report without any AI step. Saving marks the report as edited; the editor can reset the current edit or restore the pre-edit version until replaced.
_Avoid_: AI rewrite, polish mode

**Project Name Mapping**:
A user-maintained rule that turns repository and branch names into a display name for reports. A mapping can target one branch or all branches of a repository.
_Avoid_: alias, rename rule

**Evidence Detail**:
Trace information that links report items back to their original commit context. Evidence detail supports verification and should not be rewritten into unsupported claims.
_Avoid_: source note, commit detail

**Exported Report**:
A report saved outside the app for submission, sharing, or archiving. Exporting is separate from generating or polishing a report.
_Avoid_: saved output, generated file

**Blank Day Fill**:
An AI-assisted draft mode for daily reports when the target day has little or no new commit evidence. It continues themes from a user-selected historical source period and selected repositories. The output is an editable continuity draft, not proof of same-day commits.
_Avoid_: fabricate report, invent worklog, something-from-nothing generator

**Source Period**:
The historical date range whose commits supply themes for blank day fill. It is separate from the target report day.
_Avoid_: lookback window (in UI copy), fake date range

**Continuity Draft**:
The editable blank-day-fill output. Users must review it before export or submission. It must not be presented as a normal same-day report draft without disclosure.
_Avoid_: final report, auto timesheet

**Report Calendar**:
A month-grid module in Insights that visualizes when local reports were generated (daily, weekly, monthly, custom, and blank-day continuity drafts). It is about report delivery, not Git commit activity. Retention count is user-configurable in settings; clearing history is explicit and local-only.
_Avoid_: attendance calendar, timesheet, punch clock

**Support Bundle**:
A user-reviewed local ZIP export containing a redacted diagnostic snapshot and bounded current-session application events. Preparing or exporting it never uploads data; attaching it to a support request is a separate user action.
_Avoid_: log dump, telemetry upload, automatic crash report

**Safe Issue Summary**:
A short redacted aggregate suitable for copying or pre-filling a GitHub Issue. It excludes event details, local paths and attachments even when a Support Bundle exists.
_Avoid_: diagnostic attachment, full log, uploaded report

## Flagged Ambiguities

**Blank day / empty day**:
In product language, use **Blank Day Fill** for the feature and **Continuity Draft** for its output. Do not market it as inventing work with no historical basis.

**AI generation vs polishing**:
Keep **AI Polishing** for rewrite-only of an existing report draft. Use **Blank Day Fill** when AI creates a continuity draft from historical commit themes for a low-activity target day. For the sidebar conversation, use **Report Assistant**; its change suggestions are **Report Patches**, which are proposals applied only on explicit accept.

**Report Assistant vs AI Polishing**:
Both are optional and share the AI configuration, but differ in intent: AI Polishing rewrites the whole draft on demand; the Report Assistant answers questions and may propose **Report Patches** that the user reviews before applying. Never describe assistant output as an automatically applied polish.

**Assistant context selection**:
The assistant sends only the current report plus what is explicitly checked — commit evidence and selected historical reports. Changing the selection resets the conversation because a deselected history entry must not keep traveling inside an already-sent conversation.

**Project**:
In product language, prefer **Repository** for a local Git source and **Project Name Mapping** for the display name shown in a report. Use "project" only in user-facing prose where it naturally means the work area represented by commits.

**Generate**:
Use "generate a report draft" for local commit-to-report creation. Use "AI polishing" for optional rewriting so we do not imply that AI owns the source of truth.

**Logs / diagnostics**:
Use **Support Bundle** for the reviewed local export and **current-session application events** for its bounded event list. Do not imply that GitPulse persistently records user activity or uploads diagnostics in the background.

## Example Dialogue

Developer: "I selected two workspace directories, but one repository is missing."

Domain expert: "Then the repository index is stale or the workspace directory does not contain that repository. Refresh the repository index before changing the report period."

Developer: "The weekly report has no commits. Should AI polishing fix it?"

Domain expert: "No. First check author scope, report period, and whether the repository is enabled. AI polishing only rewrites an existing report draft; it does not create evidence."

Developer: "The report says `api-service(main)` but the user wants a Chinese name."

Domain expert: "Add or update a project name mapping. Keep evidence detail tied to the original repository, branch, date, and commit."

Developer: "The user had no commits today. Should AI polishing invent a daily report?"

Domain expert: "No. AI polishing only rewrites an existing report draft. Offer Blank Day Fill so the user can select a source period, choose repositories, and generate a continuity draft with disclosure."
