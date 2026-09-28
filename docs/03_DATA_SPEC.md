# Data Specification

Minimum prototype fields:

| Field | Type |
|---|---|
| timestamp | ISO-8601 string |
| src_ip | string |
| dst_ip | string |
| src_port | integer |
| dst_port | integer |
| txid | string |
| input_addresses | array |
| output_addresses | array |
| input_amounts | numeric array |
| output_amounts | numeric array |
| fee | float |
| script_type | string |
| geo_country | string |
| asn | string |

For CSV, array fields use `|` as the prototype delimiter.
