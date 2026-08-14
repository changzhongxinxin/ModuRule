#!/usr/bin/env python3
import os
import glob
import sys

SOURCE_DIR = "Rule/List"          # 相对于项目根目录
OUTPUT_DIR = "Rule/Clash"         # 相对于项目根目录
ALLOWED_SUFFIXES = {".list", ""}  # 允许 .list 后缀和无后缀文件

def clean_rule(line):
    line = line.strip()
    if not line or line.startswith('#'):
        return None
    if '//' in line:
        line = line.split('//')[0].strip()
    return line

def convert_file(input_path, output_path):
    rules = []
    with open(input_path, 'r', encoding='utf-8') as f:
        for raw_line in f:
            clean = clean_rule(raw_line)
            if clean:
                rules.append(clean)
    if not rules:
        print(f"Warning: No rules found in {input_path}, skipping.")
        return False
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("payload:\n")
        for rule in rules:
            f.write(f"  - {rule}\n")
    print(f"Converted {input_path} -> {output_path} ({len(rules)} rules)")
    return True

def main():
    all_files = glob.glob(os.path.join(SOURCE_DIR, "*"))
    files = [f for f in all_files if os.path.isfile(f)]
    
    allowed_files = []
    for f in files:
        _, ext = os.path.splitext(f)
        if ext in ALLOWED_SUFFIXES:
            allowed_files.append(f)
        else:
            print(f"Ignoring {f}: unsupported extension '{ext}'")
    
    if not allowed_files:
        print("No valid rule files found in Rule/list/")
        sys.exit(0)
    
    converted = 0
    for file_path in allowed_files:
        base = os.path.basename(file_path)
        name = os.path.splitext(base)[0]
        output_file = os.path.join(OUTPUT_DIR, f"{name}.yaml")
        if convert_file(file_path, output_file):
            converted += 1
    
    print(f"Conversion complete. {converted} files processed.")

if __name__ == "__main__":
    main()