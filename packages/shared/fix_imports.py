"""Run this script to fix imports in shared modules."""
import os
import re

def fix_imports(directory):
    for filename in os.listdir(directory):
        if filename.endswith('.py') and filename != 'fix_imports.py':
            filepath = os.path.join(directory, filename)
            with open(filepath, 'r') as f:
                content = f.read()

            # Replace relative imports with absolute
            content = re.sub(r'from \.([\w]+)', r'from shared.\1', content)
            content = re.sub(r'from \. import', r'from shared import', content)

            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Fixed: {filename}")

if __name__ == "__main__":
    fix_imports(os.path.dirname(os.path.abspath(__file__)))
