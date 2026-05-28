import os
import sys

# Make the package importable without an editable install.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
