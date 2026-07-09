-- ============================================================================
-- QA DATA CORRECTIONS
-- ============================================================================
-- One-off fixes for QA-reported issues that are bad DATA, not code bugs. Run
-- against the affected environment's database (post-deploy). Each statement is
-- scoped to the exact row the QA report names and is safe to re-run.
-- ============================================================================

-- BUG-004 — Email template "Interview Invitation 093252" was saved with the
-- wrong trigger ('referral_submitted'), so interview-invitation emails wouldn't
-- fire on interview scheduling. The seed data and save logic are correct — this
-- row was created by hand with the wrong trigger selected. Set it to match its
-- sibling "Interview Invitation 820555".
UPDATE email_templates
SET `trigger` = 'interview_scheduled'
WHERE name = 'Interview Invitation 093252'
  AND `trigger` = 'referral_submitted';
