CREATE TRIGGER IF NOT EXISTS audit_logs_reject_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log records are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_reject_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log records are append-only');
END;