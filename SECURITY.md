# Security

`aai` generates Docker Compose projects that run upstream agent software. Treat
installed services as long-running infrastructure and review generated files
before exposing them to a network.

## Supported Versions

Security updates are currently expected on the latest released version only.

## Secrets

- Do not commit real `.env` files.
- Put service credentials in `config/<agent>/.env`.
- Use `.env.example` only as a template.
- Saved remote targets under `targets/` are gitignored. They include host names,
  user names, ports, remote directories, and SSH key paths.
- Saved remote targets do not include private key contents.

## Remote Installs

Remote installs use OpenSSH with key-based authentication and `BatchMode=yes`.
The target host must allow Docker access directly, through passwordless
`sudo docker`, or by connecting as a user that can run Docker.

Before exposing a remote install:

- restrict firewall rules to the ports you intend to publish,
- prefer SSH tunnels for dashboards during setup,
- replace placeholder tokens and auth secrets,
- review generated `docker-compose.yml` and Dockerfiles.

## Reporting Vulnerabilities

Open a private report through GitHub security advisories if available. If that
is not available, open an issue with minimal public detail and ask for a private
coordination channel.

Include:

- affected version or commit,
- reproduction steps,
- impact,
- suggested fix if known.
