#!/usr/bin/env python3
"""
Analyze Flask profiling output.

Usage:
    python analyze_profile.py                    # List all profiles
    python analyze_profile.py <profile_file>    # Analyze specific file
    python analyze_profile.py --latest          # Analyze most recent profile
"""
import os
import sys
import pstats
from pathlib import Path

PROFILE_DIR = Path(__file__).parent / "profile_output"

def list_profiles():
    if not PROFILE_DIR.exists():
        print("No profile_output directory found.")
        print("Run with profiling: .\\start-servers-profiled.bat")
        return []
    
    profiles = sorted(PROFILE_DIR.glob("*.prof"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not profiles:
        print("No .prof files found.")
        return []
    
    print(f"\nFound {len(profiles)} profile files in {PROFILE_DIR}:\n")
    for i, p in enumerate(profiles[:20]):
        size_kb = p.stat().st_size / 1024
        print(f"  [{i+1:2}] {p.name} ({size_kb:.1f} KB)")
    
    if len(profiles) > 20:
        print(f"  ... and {len(profiles) - 20} more")
    
    return profiles

def analyze_profile(profile_path: Path, top_n: int = 30):
    print(f"\n{'='*70}")
    print(f"Profile: {profile_path.name}")
    print(f"{'='*70}\n")
    
    p = pstats.Stats(str(profile_path))
    
    print("TOP FUNCTIONS BY CUMULATIVE TIME:")
    print("-" * 70)
    p.sort_stats('cumulative').print_stats(top_n)
    
    print("\nTOP FUNCTIONS BY TOTAL TIME (self):")
    print("-" * 70)
    p.sort_stats('tottime').print_stats(15)

def main():
    if len(sys.argv) == 1:
        profiles = list_profiles()
        if profiles:
            print("\nUsage:")
            print("  python analyze_profile.py <filename>")
            print("  python analyze_profile.py --latest")
        return
    
    arg = sys.argv[1]
    
    if arg == "--latest":
        profiles = list_profiles()
        if profiles:
            analyze_profile(profiles[0])
    elif os.path.exists(arg):
        analyze_profile(Path(arg))
    else:
        # Try to find in profile_output
        path = PROFILE_DIR / arg
        if path.exists():
            analyze_profile(path)
        else:
            print(f"Profile not found: {arg}")
            list_profiles()

if __name__ == "__main__":
    main()
