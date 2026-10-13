-- Prevent two server processes from executing two tasks concurrently on one worker.
create unique index if not exists trading_task_queue_one_running_per_worker_idx
  on trading_task_queue (worker_id)
  where status = 'running' and worker_id is not null;
