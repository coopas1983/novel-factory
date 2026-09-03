import argparse, json
from .state import init_project, load_state
from .pipeline import stage_contract

def main():
    parser = argparse.ArgumentParser(prog="novel-factory")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("slug")
    p_status = sub.add_parser("status")
    p_status.add_argument("slug")
    p_contract = sub.add_parser("contract")
    p_contract.add_argument("stage")

    args = parser.parse_args()
    if args.cmd == "init":
        root = init_project(args.slug)
        print(f"initialized: {root}")
    elif args.cmd == "status":
        print(json.dumps(load_state(args.slug), ensure_ascii=False, indent=2))
    elif args.cmd == "contract":
        print(json.dumps(stage_contract(args.stage), ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
