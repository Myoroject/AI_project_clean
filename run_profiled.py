#!/usr/bin/env python3
"""
Run Flask with profiling enabled.
Usage: python run_profiled.py
"""
import os
import subprocess
import sys

# Set environment variable BEFORE importing anything
os.environ["FLASK_PROFILE"] = "1"

print("=" * 60)
print("Starting Flask with PROFILING ENABLED")
print("Profile output: profile_output/")
print("=" * 60)

# Run Flask
subprocess.run([
    sys.executable, "-m", "flask", 
    "--app", "app", 
    "run", 
    "--port", "5000", 
    "--debug"
])
