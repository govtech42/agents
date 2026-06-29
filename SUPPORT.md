# Support

Use GitHub issues for reproducible problems, feature requests, and documentation
gaps.

## Before Opening An Issue

Run these commands and include relevant output:

```bash
aai doctor
npm test
npm run typecheck
```

For remote install problems, also include:

- command used,
- target operating system,
- Docker and Compose versions on the remote host,
- whether Docker requires sudo,
- sanitized SSH target details.

Do not paste tokens, private keys, real `.env` contents, or sensitive host
details.

## Useful Details

Good reports include:

- expected behavior,
- actual behavior,
- exact command,
- logs or stack traces,
- whether the failure is local or remote,
- generated compose snippets with secrets removed.
