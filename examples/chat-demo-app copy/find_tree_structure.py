import os
import sys

def print_repo_structure(exclude_dirs=None, exclude_files=None):
    """
    Prints the directory structure of the repo, excluding non-essential files and directories.
    Uses the directory this script is running from as the root directory.

    Args:
        exclude_dirs (list): List of directories to exclude from scanning.
        exclude_files (list): List of files to exclude from scanning.
    """
    # Set root directory to where this script is located
    root_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    
    if exclude_dirs is None:
        exclude_dirs = ["venv", "__pycache__", "ui", "node_modules", "lambda-layer"]   
    if exclude_files is None:
        exclude_files = [
            os.path.basename(__file__),  
            ".gitignore",
            "LICENSE",
            "README.md",
            "config.yml",
            "requirements.txt",
        ]
        
    # Save to a text file
    output_path = os.path.join(root_dir, 'repo_tree.txt')
    
    # Create a list to store all output lines
    output_lines = ["Repository Structure:\n"]

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]

        rel_path = os.path.relpath(dirpath, root_dir)
        indent_level = 0 if rel_path == '.' else rel_path.count(os.sep) + 1
        
        dir_name = os.path.basename(dirpath) if rel_path != '.' else os.path.basename(root_dir)
        dir_line = "  " * indent_level + f"[{dir_name}]"
        
        print(dir_line)
        output_lines.append(dir_line)

        for filename in filenames:
            if filename in exclude_files or filename.startswith("."):
                continue
            
            file_line = "  " * (indent_level + 1) + f"- {filename}"
            print(file_line)
            output_lines.append(file_line)

    # Write all lines to the output file
    with open(output_path, 'w') as f:
        f.write("\n".join(output_lines))
    
    print(f"\nStructure saved to {output_path}")

if __name__ == "__main__":
    print_repo_structure(exclude_dirs=["venv", "__pycache__", "ui", "node_modules", "lambda-layer"])