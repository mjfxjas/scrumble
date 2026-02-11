# Ansible Deployment Host Bootstrap

This playbook is an evidence artifact for config management and can also be used in practice to prepare a Linux deployment runner.

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

## Cost profile
This does not provision new cloud infrastructure. It only configures hosts you already own.
