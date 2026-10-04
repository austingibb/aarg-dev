# Account reset recovery

Before resetting accounts, save a consistent SQLite backup, the current `.env`,
the deployed frontend, and the Git source revision under ignored
`data/account-reset-backups/<timestamp>/`. Never commit these files: the database
contains private content and password hashes, and `.env` contains credentials.

The reset deletes only rows in `users`. Preserve all other tables, including
whitelist, short links, link settings/history, clips, attachments and reward
claim history. Rotate the session signing secret to invalidate old logins,
including admin sessions; the admin PSK/TOTP configuration stays unchanged.

To undo an account reset, stop the API, take a new consistent backup, and restore
only the original `users` rows from the snapshot in a transaction. If new users
have registered, resolve ID/email conflicts first rather than overwriting them.
Keep the new signing secret so old sessions remain invalid; users can log in
again. Do not restore the whole old database over newer clips, short links or
reward claims. Restart the API after recovery and verify login.

The private backup manifest records the checkpoint commit, deployed build,
timestamp, user count, and before/after fingerprints for every preserved table.
Keep that backup until the account reset and subsequent feature rollout have
been accepted. Application rollback uses the checkpoint source and frontend;
retain current data unless deliberately restoring selected account rows.
