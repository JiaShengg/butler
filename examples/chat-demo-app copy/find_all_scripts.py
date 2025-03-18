import os

def print_repo_structure_and_code(root_dir=".", exclude_dirs=None, exclude_files=None):
    """
    Prints the directory structure of the repo along with the content of Python and TypeScript files.

    Args:
        root_dir (str): The root directory to start scanning. Defaults to the current directory.
        exclude_dirs (list): List of directories to exclude from scanning.
        exclude_files (list): List of files to exclude from scanning.
    """
    if exclude_dirs is None:
        exclude_dirs = ["venv", "__pycache__","ui","node_modules","lambda-layer"]
    if exclude_files is None:
        exclude_files = []  # No need to use __file__

    # Exclude .json files
    exclude_files.extend([f for f in os.listdir(root_dir) if f.endswith('.json')])

    repo_structure = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]

        indent_level = dirpath.count(os.sep)
        repo_structure.append("  " * indent_level + f"[{os.path.basename(dirpath)}]")

        for filename in filenames:
            if filename in exclude_files:
                continue

            filepath = os.path.join(dirpath, filename)
            if filename.endswith((".py", ".ts")):
                repo_structure.append("  " * (indent_level + 1) + f"- {filename}")
                try:
                    with open(filepath, "r") as file:
                        repo_structure.append("  " * (indent_level + 2) + "[Code Start]")
                        for line in file:
                            repo_structure.append("  " * (indent_level + 2) + line.rstrip())
                        repo_structure.append("  " * (indent_level + 2) + "[Code End]")
                except Exception as e:
                    repo_structure.append("  " * (indent_level + 2) + f"[Error reading file: {e}]")
            else:
                repo_structure.append("  " * (indent_level + 1) + f"- {filename}")

    return repo_structure

repo_output = print_repo_structure_and_code(exclude_dirs=["venv", "__pycache__","ui","node_modules","lambda-layer"])

# Save to a text file
output_path = 'repo_structure.txt'
with open(output_path, 'w') as f:
    f.write("\n".join(repo_output))

print(f"Repository structure saved to {output_path}")