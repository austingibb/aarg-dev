export class Worker {
  constructor(store, scraper, config, { now = Date.now, log = console.log } = {}) {
    this.store = store
    this.scraper = scraper
    this.config = config
    this.now = now
    this.log = log
    this.busy = false
  }
  async tick() {
    if (this.busy) return false
    this.busy = true
    try {
      const job = this.store.claim(this.now(), this.config)
      if (!job) return false
      this.log(JSON.stringify({ event: 'visit_started', job: job.key, at: this.now() }))
      let result, error
      try { result = await this.scraper.scrape(job) }
      catch (caught) { error = caught }
      this.store.finish(job, result, error, this.now(), this.config)
      this.log(JSON.stringify({ event: error ? 'visit_failed' : 'visit_cached', job: job.key, at: this.now(), ...(error ? { code: error.code || 'scrape_failed' } : {}) }))
      return true
    } finally { this.busy = false }
  }
}
