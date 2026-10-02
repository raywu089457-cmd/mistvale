import subprocess
import sys
from pathlib import Path

scripts=Path(__file__).resolve().parent
for name in ['clean_concept_smoke.py','recolor_house_roof.py','recolor_academy_roof.py','prepare_restaurant.py','prepare_refinement.py','prepare_noticeboard.py','clean_concept_edges.py','check_atlases.py']:
    subprocess.run([sys.executable,str(scripts/name)],check=True)
