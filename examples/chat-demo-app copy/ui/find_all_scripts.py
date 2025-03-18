import os

def print_repo_structure_and_code(root_dir=".", exclude_dirs=None, exclude_files=None, output_file="repo_code_output.txt"):
    """
    Prints the directory structure of the repo and saves all file contents to a text file.

    Args:
        root_dir (str): The root directory to start scanning. Defaults to the current directory.
        exclude_dirs (list): List of directories to exclude from scanning.
        exclude_files (list): List of files to exclude from scanning.
        output_file (str): Path to the output text file where file contents will be saved.
    """
    if exclude_dirs is None:
        exclude_dirs = ["venv", "__pycache__", "dist", "node_modules", "cdk.out"] 
    if exclude_files is None:
        exclude_files = [os.path.basename(__file__)]  
    
    with open(output_file, "w", encoding="utf-8") as out_file:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
            
            indent_level = dirpath.count(os.sep)
            print("  " * indent_level + f"[{os.path.basename(dirpath)}]")
            
            for filename in filenames:
                if filename in exclude_files or "package-lock.json" in filename:
                    continue
                
                filepath = os.path.join(dirpath, filename)
                print("  " * (indent_level + 1) + f"- {filename}")

                try:
                    with open(filepath, "r", encoding="utf-8") as file:
                        out_file.write(f"\n[File: {filepath}]\n")
                        out_file.write("[Code Start]\n")
                        out_file.writelines(file.readlines())
                        out_file.write("[Code End]\n\n")
                except Exception as e:
                    print("  " * (indent_level + 2) + f"[Error reading file: {e}]")

if __name__ == "__main__":
    print("Repository Structure and Code:")
    print_repo_structure_and_code(exclude_dirs=["venv", "__pycache__", "dist", "node_modules", "cdk.out"], output_file="repo_code_output.txt")
    print("\nAll file contents have been saved to 'repo_code_output.txt'.")
