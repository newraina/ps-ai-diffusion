#!/bin/bash
cd "$(dirname "$0")/../packages/ps-ai-diffusion-bridge"
source .venv/bin/activate
python run.py
