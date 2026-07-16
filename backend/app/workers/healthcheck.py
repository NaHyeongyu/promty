from app.workers.health import worker_heartbeat_is_fresh


def main() -> None:
    raise SystemExit(0 if worker_heartbeat_is_fresh() else 1)


if __name__ == "__main__":
    main()
