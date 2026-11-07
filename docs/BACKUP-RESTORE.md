# Database backups

Every night at 2:00 AM (India time) GitHub makes an **encrypted** copy of the whole
database (students, photos, marks, settings, WhatsApp history) and keeps it for 30 days.
The workflow is `.github/workflows/db-backup.yml`.

## One-time setup

1. GitHub → this repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `BACKUP_DATABASE_URL`: the same value as `DATABASE_URL` in Render.
   - `BACKUP_PASSPHRASE`: a long password you make up. **Write it down somewhere safe.**
     Without it the backups can't be opened, and nobody (not GitHub, not us) can recover it.
2. **Actions → Daily database backup → Run workflow** to make the first backup now.
   It should finish green in about a minute.

If a backup fails, GitHub emails the account that set up the workflow.

> GitHub pauses scheduled workflows in a repository with no commits for 60 days.
> If that happens, open **Actions → Daily database backup → Enable workflow**.

## Getting a backup

**Actions → Daily database backup →** pick a run (date) **→ Artifacts →** download
`matha-db-YYYY-MM-DD.dump.gpg` (it arrives zipped; unzip it).

## Restoring a backup

You need `gpg` (comes with Git for Windows) and PostgreSQL tools (`pg_restore`, version 18 or newer).

```bash
# 1. Decrypt (asks for BACKUP_PASSPHRASE)
gpg --output matha.dump --decrypt matha-db-YYYY-MM-DD.dump.gpg

# 2. Check it: lists the tables inside
pg_restore --list matha.dump | head

# 3. Restore into an EMPTY database (a new one, never over the live data by mistake)
pg_restore --no-owner --no-privileges --dbname "postgres://USER:PASSWORD@HOST:PORT/NEWDB?sslmode=require" matha.dump
```

Then point `DATABASE_URL` in Render at the restored database.

Delete the decrypted `matha.dump` when you're done: it contains students' personal details.
