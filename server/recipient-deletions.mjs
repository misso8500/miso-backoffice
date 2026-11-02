// Contract termination is not deletion. Keep historical rows and their links,
// but exclude explicitly deleted recipients from directories and new work.
export const recipientNotDeleted = (alias = 'recipients') => `NOT EXISTS (SELECT 1 FROM recipient_deletions rd WHERE rd.recipient_id=${alias}.id)`;
export const backfillRecipientDeletions = `
INSERT INTO recipient_deletions(recipient_id,deleted_at)
SELECT r.id,MAX(e.created_at)
FROM recipients r JOIN recipient_contract_events e ON e.recipient_id=r.id AND e.type='deactivated'
WHERE r.enabled=FALSE AND NOT EXISTS (
  SELECT 1 FROM recipient_contract_events newer WHERE newer.recipient_id=r.id
  AND newer.type IN ('restored','recontracted') AND newer.created_at>=e.created_at
)
GROUP BY r.id
ON CONFLICT(recipient_id) DO NOTHING`;
