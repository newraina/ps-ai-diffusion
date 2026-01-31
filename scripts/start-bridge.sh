#!/bin/bash
cd "$(dirname "$0")/../packages/bridge"
source .venv/bin/activate
python run.py
