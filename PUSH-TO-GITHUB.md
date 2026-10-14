# PROMPT — publish ONE DROP to GitHub (fresh computer, no `gh`)

**Paste everything below the line into a fresh Freebuff session whose workspace
is pointed at the `onedrop` folder on the new machine.**

This machine has **no GitHub CLI** (`gh` is not installed and must not be
installed). Use plain `git` — over **SSH** if a key exists, otherwise over
HTTPS with a token — and the GitHub REST API only if a token is found.
Do **not** set up GitHub Pages; the owner will do that by hand.

---

## Goal

Commit the whole `onedrop` project as-is and push it to a GitHub repository.
Leave Pages alone. Report the repo URL and the push result.

## Acceptance criteria

1. A GitHub credential is located and GitHub accepts it:
   - an SSH key that authenticates (`ssh -T git@github.com` prints a greeting
     that contains `successfully authenticated`), **or**
   - an HTTPS token (PAT) that authenticates against the API.
2. A repository exists on GitHub named **`onedrop`** (public — Pages needs it)
   under the owner whose credential was found. Create it via the API if a
   token is available; otherwise hand the user the exact "new repository" URL
   and wait for them to create it empty (no README, no .gitignore, no license).
3. Local git state is clean and complete:
   - `main` is the only branch,
   - **every** project file is committed (the `README.md`, `server/`, `src/`,
     `assets/`, `index.html`, and the `dev/` scratch folders are all
     intentional — commit them),
   - nothing sensitive is staged (no keys, no tokens, no `.venv-playfield/`,
     no `__pycache__/` — the `.gitignore` already covers the last two),
   - `git status` is empty.
4. `origin` points at the GitHub repo and `git push -u origin main` succeeds.
5. The remote has the same commit as local (`git rev-parse HEAD` equals
   `git rev-parse origin/main`).
6. `README.md`'s top demo line no longer says `YOUR-USERNAME`; it uses the
   real owner, e.g. `https://<owner>.github.io/onedrop/`. (Pages itself is the
   owner's job — just fix the link text.)

## Step 1 — find the credential

Look, in this order, and **never print a secret's value into the chat or a
file**:

1. SSH keys: `ls -la ~/.ssh` for `id_ed25519`, `id_ed25519.pub`, `id_rsa`,
   `id_rsa.pub`, and any host block in `~/.ssh/config` for `github.com`.
2. Test SSH auth: `ssh -o StrictHostKeyChecking=accept-new -T git@github.com`.
   Exit code 1 with "successfully authenticated" is a **success** for SSH.
3. Tokens, only if SSH is unavailable: check environment variables
   `GH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_PAT`; then
   `git config --global --get credential.helper` and any stored credential
   for `github.com` (on Windows, `git credential-manager get`; on macOS,
   the Keychain; on Linux, `~/.git-credentials`).
4. A `~/.netrc` entry for `github.com` also counts.

Determine the account/owner:
- SSH: `ssh -T git@github.com` prints `Hi <owner>!`.
- Token: `curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/user`
  and read `.login`.

If nothing authenticates, stop and ask the user for either an SSH key path or
a token. Do not invent credentials.

## Step 2 — make sure the repo is named and ready

```sh
cd <the onedrop folder>       # this folder, the one holding index.html
git rev-parse --is-inside-work-tree || git init -b main
git branch -M main            # normalize the branch name
```

If `.git` was not transferred, `git init -b main` first; the first commit is
still fine.

## Step 3 — create the GitHub repo (no `gh`)

**With a token:**

```sh
curl -sS -X POST https://api.github.com/user/repos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{"name":"onedrop","private":false,"auto_init":false}'
```

A `422` ("name already exists") means it is already there — that is fine.

**Without a token (SSH only):** you cannot create a repo over SSH. Ask the
user to open <https://github.com/new>, enter `onedrop`, choose **Public**, and
create it **empty** (no README, no .gitignore, no license). Wait for them to
confirm before pushing.

## Step 4 — stage and commit everything

```sh
git add -A
git status                    # eyeball it: no secrets, no .venv-playfield, no __pycache__
git commit -m "ONE DROP: reggae pinball machine + local launchers + README"
```

If `git add -A` would stage a secret (a token file, an `.env`, a key), unstage
it and add it to `.gitignore` first. The local virtualenv
`dev/.venv-playfield/` and `__pycache__/` are already ignored.

The working tree carries deletions from earlier housekeeping (the old
`scripts/` copies, `.freebuff/`, `.workbuddy-ai/`) — those deletions are
intended; let `git add -A` record them.

## Step 5 — point at the remote and push

```sh
# SSH (preferred):
git remote remove origin 2>/dev/null
git remote add origin git@github.com:<owner>/onedrop.git

# ...or HTTPS with a token (only if there is no key):
# git remote add origin https://<owner>@github.com/<owner>/onedrop.git

git push -u origin main
```

## Step 6 — verify

```sh
git status -sb
git rev-parse HEAD
git rev-parse origin/main     # must equal the line above
git log --oneline -1
ssh -T git@github.com || true # only if SSH was used
```

Then open `https://github.com/<owner>/onedrop` (or `git ls-remote origin`)
and confirm the files are there.

## Step 7 — fix the README demo link

Edit `README.md` and replace the placeholder owner in the top link with the
real one:

```
### ▶ **[Play the live demo](https://<owner>.github.io/onedrop/)**
```

Commit and push that one-line fix. **Do not enable Pages** — the owner will
turn it on (Settings → Pages → Deploy from branch `main`, `/ (root)`).

## Report back

- the owner and repo URL,
- which credential was used (SSH key path, or that a token was used — no value),
- `git rev-parse HEAD` and confirmation `origin/main` matches,
- whether the API created the repo or the user did,
- anything that could not be completed (e.g. no credential found).
