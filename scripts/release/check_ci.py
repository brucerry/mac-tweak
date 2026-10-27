#!/usr/bin/env python3
"""Require completed default-branch CI for the exact version-tagged commit."""
import argparse
import json
import os
import pathlib
import re
import subprocess
from urllib.parse import urlencode

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOW = '.github/workflows/validate.yml'
REQUIRED_JOBS = {
    'macOS 15 / arm64', 'macOS 15 / x86_64',
    'Universal package / arm64', 'Universal package / x86_64',
}


def tagged_revision(root, tag):
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        raise ValueError('Release tag must have the form v0.1.0.')
    ref = 'refs/tags/' + tag
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--verify', ref + '^{commit}'], text=True).strip()
    metadata = json.loads(subprocess.check_output(['git', '-C', str(root), 'show', ref + ':src/app/metadata.json'], text=True))
    if tag != 'v' + metadata['version'] or not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Release tag must match the tagged app version.')
    return revision


def github_json(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def validated_ci(repository, revision, fetch=github_json):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Expected a GitHub repository in owner/name form.')
    base = 'repos/' + repository
    branch = fetch(base)['default_branch']
    workflow = fetch(base + '/actions/workflows/validate.yml')
    if workflow['path'] != WORKFLOW:
        raise ValueError('Unexpected validation workflow.')
    query = urlencode({'head_sha': revision, 'branch': branch, 'event': 'push', 'per_page': 100})
    runs = fetch(base + '/actions/workflows/validate.yml/runs?' + query)['workflow_runs']
    matches = [run for run in runs if
               run.get('head_sha') == revision and run.get('head_branch') == branch and
               run.get('event') == 'push' and run.get('workflow_id') == workflow['id'] and
               run.get('path') == WORKFLOW and
               (run.get('head_repository') or {}).get('full_name', '').lower() == repository.lower()]
    if not matches:
        raise ValueError('No default-branch Validation push run exists for the tagged commit.')
    latest = max(matches, key=lambda run: (run['run_number'], run['id']))
    if latest['status'] != 'completed' or latest['conclusion'] != 'success':
        raise ValueError('The latest matching Validation run must complete successfully.')
    jobs = []
    for page in range(1, 11):
        data = fetch(base + '/actions/runs/' + str(latest['id']) + '/jobs?' +
                     urlencode({'filter': 'all', 'per_page': 100, 'page': page}))
        jobs.extend(data['jobs'])
        if len(jobs) >= data['total_count']:
            break
        if not data['jobs']:
            raise ValueError('Validation job evidence is incomplete.')
    else:
        raise ValueError('Validation job evidence exceeded the page limit.')
    for name in sorted(REQUIRED_JOBS):
        candidates = [job for job in jobs if job['name'] == name]
        if not candidates:
            raise ValueError('Missing required validation job: ' + name)
        job = max(candidates, key=lambda value: value['id'])
        if job.get('head_sha') != revision or job['status'] != 'completed' or job['conclusion'] != 'success':
            raise ValueError('Required validation job did not succeed for the tagged commit: ' + name)
    return {'revision': revision, 'run_id': latest['id'],
            'url': 'https://github.com/' + repository + '/actions/runs/' + str(latest['id'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--repo', required=True)
    args = parser.parse_args()
    evidence = validated_ci(args.repo, tagged_revision(ROOT, args.tag))
    print('PASS: ' + args.tag + ' at ' + evidence['revision'] + '; all four CI jobs passed: ' + evidence['url'])
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('revision=' + evidence['revision'] + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('Validated `' + args.tag + '` at `' + evidence['revision'] + '` using [all four CI checks](' + evidence['url'] + ').\n')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        raise SystemExit('Release CI gate failed: ' + str(error))
