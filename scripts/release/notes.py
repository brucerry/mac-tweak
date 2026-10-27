#!/usr/bin/env python3
"""Render the reference release layout with real links from the checked-out tag."""
import argparse,json,pathlib,re,subprocess
root=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);parser.add_argument('--output',type=pathlib.Path,required=True);args=parser.parse_args()
meta=json.loads((root/'src/app/metadata.json').read_text());expected='v'+meta['version']
if args.tag!=expected or not re.fullmatch(r'v\d+\.\d+\.\d+',args.tag):raise SystemExit('Tag must match metadata version: '+expected)
def git(*values):return subprocess.check_output(['git','-C',str(root),*values],text=True).strip()
head=git('rev-parse','HEAD');tag=git('rev-parse',args.tag+'^{commit}')
if head!=tag:raise SystemExit('Checked-out commit does not match release tag.')
tags=git('tag','--merged','HEAD','--sort=-version:refname').splitlines();previous=next((t for t in tags if t!=args.tag and re.fullmatch(r'v\d+\.\d+\.\d+',t)),None)
lines=git('log','--format=%H%x09%s',(previous+'..HEAD') if previous else 'HEAD').splitlines()
notes=(root/'docs/releases'/f'{args.tag}.md').read_text().rstrip()+'\n\n'
for line in lines[:50]:
    sha,subject=line.split('\t',1);subject=subject.replace('[','\\[').replace(']','\\]').replace('<','&lt;').replace('>','&gt;')
    notes+=f'- [{sha[:7]}]({meta["repository"]}/commit/{sha}) — {subject}\n'
notes+=f'- [Full changelog]({meta["repository"]}/'+(f'compare/{previous}...{args.tag}' if previous else f'commits/{args.tag}')+').\n'
args.output.write_text(notes)
