"""Exact-tag CI evidence and fail-closed release gating; no remote mutations."""
import copy
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit

root = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_ci', root / 'scripts/release/check_ci.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = 'a' * 40


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.run = dict(id=10, run_number=3, workflow_id=7, path=gate.WORKFLOW, event='push',
                        head_branch='main', head_sha=SHA, head_repository={'full_name': 'fixture/repo'},
                        status='completed', conclusion='success')
        self.runs = [self.run]
        self.jobs = [dict(id=index + 20, name=name, head_sha=SHA, status='completed', conclusion='success')
                     for index, name in enumerate(sorted(gate.REQUIRED_JOBS))]
        self.page_size = 100

    def fetch(self, path):
        if path == 'repos/fixture/repo':
            return {'default_branch': 'main'}
        if path.endswith('/actions/workflows/validate.yml'):
            return {'id': 7, 'path': gate.WORKFLOW}
        if '/workflows/validate.yml/runs?' in path:
            query = parse_qs(urlsplit(path).query)
            self.assertEqual(query['head_sha'], [SHA])
            self.assertEqual(query['branch'], ['main'])
            self.assertEqual(query['event'], ['push'])
            return {'workflow_runs': self.runs}
        self.assertIn('/actions/runs/10/jobs?', path)
        query = parse_qs(urlsplit(path).query)
        self.assertEqual(query['filter'], ['all'])
        page = int(query['page'][0])
        start = (page - 1) * self.page_size
        return {'total_count': len(self.jobs), 'jobs': self.jobs[start:start + self.page_size]}

    def check(self):
        return gate.validated_ci('fixture/repo', SHA, self.fetch)

    def test_exact_completed_evidence(self):
        self.assertEqual(self.check()['revision'], SHA)
        self.assertEqual(self.check()['run_id'], 10)

    def test_unrelated_runs_never_qualify(self):
        for key, value in [('head_sha', 'b' * 40), ('head_branch', 'v0.1.0'), ('event', 'pull_request'),
                           ('workflow_id', 8), ('path', '.github/workflows/other.yml'),
                           ('head_repository', {'full_name': 'other/repo'})]:
            with self.subTest(key=key):
                wrong = copy.deepcopy(self.run)
                wrong[key] = value
                self.runs = [wrong]
                with self.assertRaises(ValueError):
                    self.check()

    def test_no_matching_run(self):
        self.runs = []
        with self.assertRaises(ValueError):
            self.check()

    def test_latest_failure_cannot_fall_back_to_older_success(self):
        for state in [('completed', 'failure'), ('completed', 'cancelled'), ('in_progress', None)]:
            with self.subTest(state=state):
                latest = {**self.run, 'id': 11, 'run_number': 4, 'status': state[0], 'conclusion': state[1]}
                self.runs = [self.run, latest]
                with self.assertRaises(ValueError):
                    self.check()

    def test_every_required_job_is_mandatory(self):
        for index in range(4):
            with self.subTest(index=index):
                original = self.jobs
                self.jobs = original[:index] + original[index + 1:]
                with self.assertRaises(ValueError):
                    self.check()
                self.jobs = original

    def test_job_commit_status_and_conclusion(self):
        for key, value in [('head_sha', 'b' * 40), ('status', 'in_progress'), ('conclusion', 'skipped'), ('conclusion', 'failure')]:
            with self.subTest(key=key, value=value):
                original = copy.deepcopy(self.jobs)
                self.jobs[0][key] = value
                with self.assertRaises(ValueError):
                    self.check()
                self.jobs = original

    def test_latest_job_attempt_wins(self):
        original = self.jobs[0]
        self.jobs.append({**original, 'id': 100, 'conclusion': 'failure'})
        with self.assertRaises(ValueError):
            self.check()
        self.jobs.append({**original, 'id': 101})
        self.assertEqual(self.check()['run_id'], 10)

    def test_paginated_job_evidence(self):
        self.page_size = 2
        self.assertEqual(self.check()['run_id'], 10)

    def test_repository_input_is_bounded(self):
        with self.assertRaises(ValueError):
            gate.validated_ci('https://other.invalid/repo', SHA, self.fetch)


class TagTests(unittest.TestCase):
    def test_tag_uses_its_own_metadata_and_commit(self):
        with tempfile.TemporaryDirectory(prefix='mac-tweak-release-ci-') as directory:
            repo = pathlib.Path(directory)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), '-c', 'user.name=Fixture',
                                                '-c', 'user.email=fixture@example.invalid', *args], text=True).strip()
            git('init', '-q')
            metadata = repo / 'src/app/metadata.json'
            metadata.parent.mkdir(parents=True)
            metadata.write_text(json.dumps({'version': '0.1.0'}))
            git('add', '.')
            git('commit', '-qm', 'Tagged source')
            target = git('rev-parse', 'HEAD')
            git('tag', '-a', 'v0.1.0', '-m', 'Fixture release')
            metadata.write_text(json.dumps({'version': '0.2.0'}))
            git('add', '.')
            git('commit', '-qm', 'Later workflow control')
            self.assertEqual(gate.tagged_revision(repo, 'v0.1.0'), target)
            git('tag', 'v9.9.9')
            for tag in ['v9.9.9', 'main', '--all']:
                with self.subTest(tag=tag), self.assertRaises(ValueError):
                    gate.tagged_revision(repo, tag)


unittest.main()
