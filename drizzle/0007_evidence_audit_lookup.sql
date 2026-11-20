-- Additive lookup index; no approval state, rights, or existing records change.
CREATE INDEX IF NOT EXISTS archive_audit_action_actor ON archive_audit(action, actor);
