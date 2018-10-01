---
title: "Practical Go: Flexible rate limiting"
---

Recently I've been working out some ideas on how to do dynamic rate-limiting in
Go. I'm interested in applications to performance testing, which can require
more sophisticated strategies than the more-common use cases, like controlling
resource utilization. It can be useful to dynamically change the rate-limit
while running to match the capabilities of the system under test.

The most common throttling strategy in Go uses the standard library's
`time.Ticker`. This is, in turn, just a thin wrapper around the Go runtimes's
low-level timer implementation, which XXX something buckets. The ticker gets
fired after the specified duration is reached and XXX. This doesn't offer much
in the way of XXX. To use this for throttling, XXX simply block on receiving
a time from the ticker before executing a task.

After some quick Googling I turned up XXX(two?) alternative implementations. The
first is a compositional approach [from Go by
Example](https://gobyexample.com/rate-limiting) that builds on top of the
standard library . This approach places a throttling channel between the ticker
and the client, which makes it possible to XXX. For instance, to allow a fixed-count
burst of requests, while maintaing an overall fixed rate limit, use a bounded
channel to buffer inputs from the ticker. I'll dive into XXX below, but XXX

An alternative to using an interval timer for rate-limiting is to sleep for
an interval between requests,
[`github.com/uber-go/ratelimit`](https://github.com/uber-go/ratelimit) is one
implementation of this strategy. XXX.

## Slow consumers

A problem with XXX is that XXX. The Go documentation says that XXX ""; I haven't
experimented or dug through the underlying timer implementation to see what
exactly that means. Regardless, it's clear that it's handled somehow. This is also
fine for the delta-based XXX.

The Go by Example version, on the other hand XXX. The core code XXX.

```go
burstyLimiter := make(chan time.Time, 3)

go func() {
    for t := range time.Tick(200 * time.Millisecond) {
        burstyLimiter <- t
    }
}()
```

The XXX is that the goroutine consuming from time.Tick will block on a slow XXX

XXX

## Adjustable rate limiting

The solution I've come up with goes back to the old `Ticker` approach.

```go
type DynamicThrottler struct {
    throttleCh chan time.Time,
}

func (th *DynamicThrottler) Start() {

}

func (th *DynamicThrottler) Stop() {

}

func (th *DynamicThrottler) UpdateRate(d Duration) {

}

func (th *DynamicThrottler) Take() {
    <- th.throttleCh
}

burstyLimiter := make(chan time.Time, 3)

go func() {
    for t := range time.Tick(200 * time.Millisecond) {
        burstyLimiter <- t
    }
}()
```

## Timing accuracy

Initially I noticed that the timer XXX.

XXX conclude
