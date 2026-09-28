from pathlib import Path
from backend.services.parsers import parse_uploaded_bytes

def test_sample_csv_parses():
    p = Path("data/sample/sample_transactions.csv")
    rows = parse_uploaded_bytes(p.name, p.read_bytes())
    assert len(rows) >= 5
    assert isinstance(rows[0]["output_addresses"], list)


def test_xlsx_parses():
    import io
    import pandas as pd
    from backend.services.parsers import parse_with_report

    df = pd.DataFrame({
        "txid": ["tx_excel_1", "tx_excel_2"],
        "timestamp": ["2023-01-01 12:00:00", "2023-01-01 12:05:00"],
        "input_addresses": ["addrA|addrB", "addrC"],
        "output_addresses": ["addrD", "addrE"],
        "input_amounts": ["1.5|0.5", "2.0"],
        "output_amounts": ["1.99", "1.99"],
        "src_ip": ["192.168.1.10", "192.168.1.11"],
        "dst_ip": ["10.0.0.1", "10.0.0.2"],
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    records, report = parse_with_report("capture.xlsx", buf.getvalue())

    assert len(records) == 2
    assert report["rows_accepted"] == 2
    assert report["format"] == "xlsx"
    assert records[0]["txid"] == "tx_excel_1"
    assert records[0]["input_addresses"] == ["addrA", "addrB"]
    assert records[0]["input_amounts"] == [1.5, 0.5]

