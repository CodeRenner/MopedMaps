import json
import zipfile

from mopedmaps_pipeline.cli import main
from mopedmaps_pipeline.plz import ATTRIBUTION, aggregate

ROWS = [
    "DE\t28195\tBremen\tBremen\tHB\t\t\t\t\t53.0793\t8.8017\t",
    "DE\t28195\tBremen\tBremen\tHB\t\t\t\t\t53.0793\t8.8017\t",  # duplicate point
    "DE\t28195\tBremen Mitte\tBremen\tHB\t\t\t\t\t53.0813\t8.8037\t",
    "DE\t28195\tBremen\tBremen\tHB\t\t\t\t\t53.0753\t8.7997\t",
    "DE\t01067\tDresden\tSachsen\tSN\t\t\t\t\t51.0574\t13.7117\t",
    "AT\t1010\tWien\t\t\t\t\t\t\t48.2\t16.37\t",  # other country
    "DE\t123\tBroken\t\t\t\t\t\t\t50\t10\t",  # invalid PLZ
    "DE\t99999\tNoCoords\t\t\t\t\t\t\tx\ty\t",
]


def test_aggregate_averages_distinct_points_and_picks_common_name():
    rows = aggregate(ROWS)
    assert [r[0] for r in rows] == ["01067", "28195"]
    plz, lat, lon, name = rows[1]
    assert name == "Bremen"
    assert lat == round((53.0793 + 53.0813 + 53.0753) / 3, 4)
    assert lon == round((8.8017 + 8.8037 + 8.7997) / 3, 4)


def test_cli_writes_compact_table(tmp_path, capsys):
    z = tmp_path / "DE.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("DE.txt", "\n".join(ROWS) + "\n")
    out = tmp_path / "plz.json"
    assert main(["plz", str(z), str(out)]) == 0
    table = json.loads(out.read_text("utf-8"))
    assert table["v"] == 1 and table["attribution"] == ATTRIBUTION
    assert table["rows"][0] == ["01067", 51.0574, 13.7117, "Dresden"]
    assert "2 PLZ" in capsys.readouterr().out
