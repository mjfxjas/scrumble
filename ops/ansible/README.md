# Ansible Deployment Host Bootstrap

Ansible playbook for preparing a Linux deployment runner.

## What it does

- Installs deployment prerequisites (`awscli`, `git`, `python3`, `jq`, `curl`, `unzip`)
- Installs AWS SAM CLI
- Creates a dedicated deploy user (`github-actions` by default)

## Usage

1. Add your host(s) to `inventory/hosts.ini`.
2. Run:

```bash
cd ops/ansible
ansible-playbook playbooks/bootstrap-deployer.yml
```

## Scope

This does not provision new cloud infrastructure. It only configures hosts you already own.
