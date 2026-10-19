CREATE TABLE IF NOT EXISTS verification_audit (
 id uuid PRIMARY KEY,
 checked_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 account_fingerprint text NOT NULL CHECK (length(account_fingerprint) = 64),
 bank_code text NOT NULL,
 payment_status text NOT NULL,
 recipient_status text NOT NULL,
 match_status text NOT NULL,
 provider_code text NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_audit_expiry ON verification_audit(expires_at);
COMMENT ON TABLE verification_audit IS 'Minimal internal audit. No account numbers, names, URLs, purposes, provider payloads, IPs or files.';
