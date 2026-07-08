# Responsible EdTech Evidence Portfolio

Updated: 2026-07-08

Status: working internal evidence map for the EdTech for Good Framework 2.0. This is not a certification, legal review, child safeguarding audit, procurement approval, cybersecurity audit, or data protection impact assessment.

## Purpose

This document maps Rozumko against the EdTech for Good Framework 2.0 and turns the framework into practical product work. It uses evidence currently present in this repository, including public pages, architecture notes, security docs, ADRs, tests, and operational runbooks.

The framework is most useful for Rozumko as an evidence discipline:

- make the product logic explicit;
- keep child safety, privacy, and learning value tied to actual implementation;
- separate implemented controls from planned claims;
- identify which evidence would make the product more credible for parents, teachers, pilots, and partners.

## Product Snapshot

Rozumko is a Ukrainian-first educational platform for grades 1-4. It develops computational thinking, digital literacy, and age-appropriate AI literacy through short missions, classroom play, home practice, and seasonal events.

Current product surfaces:

- School Mode: free classroom trust channel with anonymous class participation, no parent accounts, no payments, and no individual school-to-home transfer.
- Home Mode: parent-led practice path with consent before saved progress or reports, child profiles created by an adult, and paid access prepared through a backend entitlement boundary.
- Olympiad and seasonal events: motivation peaks with code-based student access and server-side scoring.

Core repo evidence:

- [README](../README.md)
- [Product roadmap](./product-roadmap.md)
- [Architecture](./architecture.md)
- [Security model](./security-model.md)
- [Home demo contract](./home-demo-contract.md)
- [Content taxonomy](./content-taxonomy.md)
- [Accessibility and inclusion baseline](./accessibility-inclusion-baseline.md)
- [Security operations evidence](./security-ops-evidence.md)
- [Transparency page](../transparency.html)
- [Privacy policy](../privacy.html)
- [Terms](../terms.html)
- [For parents](../for-parents.html)
- [For teachers](../for-teachers.html)

## Framework Fit Summary

| Framework area | Current fit | Evidence maturity | Main value already present | Main next evidence needed |
| --- | --- | --- | --- | --- |
| Organization Logic Model | Partial to strong | Basic / intermediate | Clear purpose, owner identity, public transparency, security posture, runbooks | Formal safeguarding process, partner/pilot evidence, governance and incident evidence |
| Product Logic Model | Strong | Intermediate | Clear audience, surfaces, learning intent, implementation boundaries, AI transparency | Measured outcomes, pilot data, explicit theory-of-change metrics |
| Safety and Well-being | Strong | Intermediate | Server-side scoring, no child accounts, no child PII in School Mode, consent gates, privacy pages, security tests | Completed operational evidence checklist, safeguarding escalation process, independent review |
| Educational Impact | Partial | Basic / intermediate | Curriculum-aligned taxonomy, tagged content bank, reports, missions, classroom/home use cases | Learning impact plan, baseline measures, pilot feedback, longitudinal evidence |
| Designed for Teaching and Learning | Strong | Basic / intermediate | Age-bounded missions, short sessions, multiple mechanics, teacher/parent flows | Pedagogical QA rubric, content review log, accessibility testing with children |
| Contextual Readiness | Strong | Intermediate | Ukrainian-first, browser-based, low-friction School Mode, PWA/offline shell, runbooks | Low-connectivity evidence, device matrix, resilience drills |
| Inclusive Access | Partial | Basic / intermediate | Free School Mode, no registration burden for children, mobile-first pages, skip links, WCAG baseline, static HTML guardrails, expanded axe smoke guard | Manual screen reader/keyboard matrix, device evidence, inclusive design adaptations |

## Organization Logic Model

### Purpose and Accountability

Evidence:

- The product purpose is consistently framed as computational thinking and age-appropriate AI literacy for grades 1-4.
- Public pages explain the three surfaces for parents and teachers.
- The privacy policy identifies the owner and contact channel.
- The transparency page explains how AI tools are used in development and not as a child-facing scoring authority.

Useful framework value:

- Keep one public "responsible EdTech" narrative that joins product purpose, child safety, AI transparency, and data boundaries.

Gap:

- The repo does not yet contain a clear child safeguarding and incident escalation statement for non-technical audiences.
- Governance is visible through docs and tests, but not yet packaged as an evidence portfolio for pilots or institutional review.

### Sustainability and Incentives

Evidence:

- The roadmap and architecture preserve a free School Mode and a parent-led paid Home Mode.
- The current payment boundary is backend-first and provider-neutral. Provider-specific checkout is still planned.
- Public copy does not require teachers to sell Home access.

Useful framework value:

- This is a strong trust story: School Mode is not a lead-capture trap, and Home Mode is separated from school identity.

Gap:

- There is no compact public explanation of the sustainability model and why it protects school trust.

### Responsible AI and Dependencies

Evidence:

- AI is currently product content and a development support tool, not a child-facing tutor or scoring authority.
- Public pages state that children do not interact with an AI bot and that deterministic scoring is server-side.
- `robots.txt` includes `ai-train=no`.

Useful framework value:

- Treat future AI-generated missions as a new risk boundary, not as a normal content update.

Gap:

- Before activating AI-generated content, Rozumko needs an AI feature inventory, review workflow, provenance rules, and test evidence that no answer keys or unsafe generated content reach the browser.

## Product Logic Model

### Users and Contexts

Evidence:

- Children use short missions, class games, Home demo/practice, and event access codes.
- Teachers use School Mode without becoming sales agents.
- Parents control Home consent, profile creation, and access decisions.
- Official events use code-based access and server-side scoring.

Useful framework value:

- The current School/Home/Olympiad separation is a product strength and should remain an explicit design principle.

Gap:

- User research evidence is not yet documented: parent interviews, teacher feedback, classroom pilot notes, or child usability observations.

### Intended Learning Outcomes

Evidence:

- The content taxonomy documents tracks, topics, concept keys, progression bands, and a tagged question bank.
- The product claims focus on computational thinking, informatics, and AI basics.
- Home reports and school aggregate results are designed to explain progress without exposing answer keys.

Useful framework value:

- Convert the taxonomy into a measurable learning impact plan.

Gap:

- The repo has content structure, but not yet an evaluation model: baseline tasks, target indicators, pilot design, and success thresholds.

### Product Function and Risk Boundaries

Evidence:

- Official and Home scoring are server-side.
- Browser-delivered practice questions are stripped or limited according to surface.
- `features/api/client.ts` is the single frontend HTTP boundary.
- ADRs document server-side scoring, no student accounts, backend-only DB access, and entitlement boundaries.

Useful framework value:

- The product already has unusually clear implementation boundaries for a small EdTech product. These should be surfaced as trust evidence.

Gap:

- Some controls are documented as runbooks/checklists rather than completed evidence records.

## ET4G Pillars

### 1. Safety and Well-being

What is strong:

- No Supabase Auth accounts for students.
- School Mode avoids child personal data, parent payments, and individual school-to-home transfer.
- Home Mode uses parent consent before saved progress or reports.
- Scoring authority lives on the backend for official and Home flows.
- Security docs define fail-closed behavior for payment entitlement.
- Regression tests cover key security invariants.
- Public transparency and privacy pages explain AI and data boundaries.

What to take from the framework:

- Add a non-technical safeguarding and incident-response layer. Security docs cover technical risk well, but parents and schools also need to know what happens if content, contact, or data concerns are reported.

High-value next additions:

- Public responsible-use and safeguarding statement.
- Private pilot incident log template.
- Completed security evidence checklist before any partner pilot.

### 2. Educational Impact

What is strong:

- Clear age range and subject focus.
- Tagged content bank with topic and concept structure.
- Home reports and school aggregate views connect activity to learning areas.
- The product avoids inflated claims such as replacing teachers or tutoring all subjects.

What to take from the framework:

- Turn learning claims into measurable evidence. "Improves computational thinking" should be backed by task-level indicators and pilot feedback.

High-value next additions:

- Learning impact plan with 3-5 measurable indicators.
- Parent and teacher feedback forms mapped to the taxonomy.
- Pilot report template that separates engagement, correctness, completion, and observed learning behavior.

### 3. Designed for Teaching and Learning

What is strong:

- Short missions match the attention span of grades 1-4.
- Multiple question mechanics support varied practice.
- Classroom game flow is low-friction.
- Teacher-facing copy makes School Mode practical without forcing account setup for children.
- Parent-facing Home flow uses consent and a readable report.

What to take from the framework:

- Add a content QA rubric so new missions can be reviewed for age fit, clarity, cognitive load, fairness, and misconception risk.

High-value next additions:

- Mission review checklist.
- Content change log with reviewer/date/source.
- Child usability notes for mission length, wording, and frustration points.

### 4. Contextual Readiness

What is strong:

- Ukrainian-first public experience.
- Browser-based delivery with static frontend and backend API.
- Free School Mode lowers adoption friction.
- Operational docs cover deployment, monitoring, smoke testing, backups, and event-day flow.
- PWA/offline shell exists, with backend/API caching avoided.

What to take from the framework:

- Readiness is not only deployment. It includes local devices, connectivity, teacher time, support burden, and resilience during real lessons.

High-value next additions:

- Device and browser support matrix.
- Low-connectivity classroom guidance.
- Short teacher onboarding checklist for a first 15-minute session.

### 5. Inclusive Access

What is strong:

- Children can participate in School Mode without personal registration.
- Core pages are mobile-oriented and lightweight.
- Public pages include basic navigation and skip-link patterns.
- Free School Mode keeps access from depending on family payment.
- A WCAG 2.2 AA working baseline now exists for public and product surfaces.
- The automated guardrails combine static HTML checks, axe checks across core public/app pages, axe checks for rendered question mechanics, and behavior checks for Home/School mission controls.

What to take from the framework:

- Inclusive access is no longer undocumented, but it remains the weakest evidence area until manual keyboard, screen reader, zoom, reduced-motion, and child usability evidence is collected.

High-value next additions:

- Complete the first manual keyboard-only and screen-reader smoke matrix for the child mission, Home demo, School join, and teacher flow.
- Add 320 px, 200% zoom, reduced-motion, and focus-visible evidence.
- Expand automated smoke coverage to remaining static pages and dynamic app states.
- Review wording, contrast, target sizes, and error recovery for early primary pupils.

## Evidence Quality Matrix

| Area | Current repo evidence | Evidence quality today | Next evidence to collect |
| --- | --- | --- | --- |
| Product purpose | README, public pages, roadmap, architecture | Specific and current | Public responsible EdTech summary |
| Child safety | Security model, ADRs, tests, privacy, transparency | Concrete and credible | Safeguarding process and pilot incident evidence |
| Data protection | Privacy policy, backend-only DB rule, consent flows, security tests | Concrete and implementation-linked | Data inventory and retention review record |
| AI transparency | Transparency page, README, robots.txt, no child-facing AI bot | Specific | AI feature inventory before AIG activation |
| Learning design | Taxonomy, missions, reports, question mechanics | Specific but mostly internal | Content QA rubric and review log |
| Learning impact | Product claims and reports | Partial | Pilot measures, baseline tasks, feedback forms |
| Teacher fit | For-teachers page, School Mode flow, classroom game | Specific | Teacher pilot notes and onboarding checklist |
| Parent trust | For-parents page, Home consent, privacy, report flow | Specific | Parent feedback and support FAQ |
| Accessibility | Baseline checklist, basic public page patterns, mobile-first UI, static HTML guardrails, expanded axe and mission-control smoke tests | Partial / improving | Manual keyboard, screen reader, zoom, reduced-motion, device, and child usability evidence |
| Operations | Runbooks, Render config, smoke/load docs, backup docs | Concrete | Completed pilot readiness checklist |

## Prioritized Backlog

### P0 - before a serious pilot or partner pitch

- Create a short public responsible EdTech page in Ukrainian that explains safety, privacy, AI use, School/Home separation, and how to report concerns.
- Complete the private security operations evidence checklist and keep only non-sensitive status public.
- Complete the first manual accessibility evidence run for keyboard, screen reader, mobile/touch, reduced motion, zoom, and early-primary readability.
- Create a learning impact plan with measurable indicators and pilot feedback forms.
- Add a content QA rubric for new missions and AI-literacy content.

### P1 - after the baseline evidence exists

- Add a device/browser support matrix and low-connectivity classroom guidance.
- Create teacher and parent pilot report templates.
- Document the sustainable trust model: School Mode is free and separate; Home Mode is parent-led and paid.
- Add an AI feature inventory before any generated-content workflow becomes active.

### P2 - for stronger external credibility

- Run a small classroom/home pilot and publish a non-sensitive summary.
- Invite external review of content quality and child-safety posture.
- Track longitudinal learning indicators across several Home practice cycles.
- Consider independent accessibility and security reviews before larger institutional adoption.

## Recommended Next Step

The best next slice is the first manual accessibility evidence run. It is high-value, relatively small, and directly improves the weakest ET4G pillar without changing product positioning.

Suggested source file: [Accessibility and inclusion baseline](./accessibility-inclusion-baseline.md).
