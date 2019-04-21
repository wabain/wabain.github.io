---
title: Lorem ipsum dolor sit amet consectetur adipisicing elit. Deleniti labore et perspiciatis neque nostrum ut officia aperiam eum? Sapiente, tempore.
tags: [Lorem, ipsum, dolor, sit-amet]
---

Lorem ipsum dolor, sit amet consectetur adipisicing elit. Aliquam, ex quas obcaecati, suscipit quis a at inventore ad delectus, nemo repellat impedit quos ut facere commodi odio quaerat ipsa accusantium?

Et a, odio sapiente, mollitia corrupti sint harum iusto eaque laudantium eius laborum ullam. Pariatur, odit. Odit quia porro cupiditate vero repellendus. Culpa quia ex voluptates, laboriosam fuga quis ipsum.

Unde alias doloribus rerum id in ullam eligendi consequatur est nostrum atque, sit quibusdam itaque et expedita repellat saepe? Mollitia vero ratione reiciendis nisi veritatis repudiandae rerum, doloremque est laudantium?

Natus similique quo ullam magnam. Quasi, ab corporis at repudiandae aperiam velit perferendis eaque doloremque esse est debitis id in officiis, fugiat molestias, porro reiciendis fugit amet provident neque rerum!

`kernel/trace/trace_sched_switch.c`:

```c
// SPDX-License-Identifier: GPL-2.0
/*
 * trace context switch
 *
 * Copyright (C) 2007 Steven Rostedt <srostedt@redhat.com>
 *
 */
#include <linux/module.h>
#include <linux/kallsyms.h>
#include <linux/uaccess.h>
#include <linux/ftrace.h>
#include <trace/events/sched.h>

#include "trace.h"

#define RECORD_CMDLINE	1
#define RECORD_TGID	2

static int		sched_cmdline_ref;
static int		sched_tgid_ref;
static DEFINE_MUTEX(sched_register_mutex);

static void
probe_sched_switch(void *ignore, bool preempt,
		   struct task_struct *prev, struct task_struct *next)
{
	int flags;

	flags = (RECORD_TGID * !!sched_tgid_ref) +
		(RECORD_CMDLINE * !!sched_cmdline_ref);

	if (!flags)
		return;
	tracing_record_taskinfo_sched_switch(prev, next, flags);
}

static void
probe_sched_wakeup(void *ignore, struct task_struct *wakee)
{
	int flags;

	flags = (RECORD_TGID * !!sched_tgid_ref) +
		(RECORD_CMDLINE * !!sched_cmdline_ref);

	if (!flags)
		return;
	tracing_record_taskinfo(current, flags);
}

static int tracing_sched_register(void)
{
	int ret;

	ret = register_trace_sched_wakeup(probe_sched_wakeup, NULL);
	if (ret) {
		pr_info("wakeup trace: Couldn't activate tracepoint"
			" probe to kernel_sched_wakeup\n");
		return ret;
	}

	ret = register_trace_sched_wakeup_new(probe_sched_wakeup, NULL);
	if (ret) {
		pr_info("wakeup trace: Couldn't activate tracepoint"
			" probe to kernel_sched_wakeup_new\n");
		goto fail_deprobe;
	}

	ret = register_trace_sched_switch(probe_sched_switch, NULL);
	if (ret) {
		pr_info("sched trace: Couldn't activate tracepoint"
			" probe to kernel_sched_switch\n");
		goto fail_deprobe_wake_new;
	}

	return ret;
fail_deprobe_wake_new:
	unregister_trace_sched_wakeup_new(probe_sched_wakeup, NULL);
fail_deprobe:
	unregister_trace_sched_wakeup(probe_sched_wakeup, NULL);
	return ret;
}

static void tracing_sched_unregister(void)
{
	unregister_trace_sched_switch(probe_sched_switch, NULL);
	unregister_trace_sched_wakeup_new(probe_sched_wakeup, NULL);
	unregister_trace_sched_wakeup(probe_sched_wakeup, NULL);
}

static void tracing_start_sched_switch(int ops)
{
	bool sched_register = (!sched_cmdline_ref && !sched_tgid_ref);
	mutex_lock(&sched_register_mutex);

	switch (ops) {
	case RECORD_CMDLINE:
		sched_cmdline_ref++;
		break;

	case RECORD_TGID:
		sched_tgid_ref++;
		break;
	}

	if (sched_register && (sched_cmdline_ref || sched_tgid_ref))
		tracing_sched_register();
	mutex_unlock(&sched_register_mutex);
}

static void tracing_stop_sched_switch(int ops)
{
	mutex_lock(&sched_register_mutex);

	switch (ops) {
	case RECORD_CMDLINE:
		sched_cmdline_ref--;
		break;

	case RECORD_TGID:
		sched_tgid_ref--;
		break;
	}

	if (!sched_cmdline_ref && !sched_tgid_ref)
		tracing_sched_unregister();
	mutex_unlock(&sched_register_mutex);
}

void tracing_start_cmdline_record(void)
{
	tracing_start_sched_switch(RECORD_CMDLINE);
}

void tracing_stop_cmdline_record(void)
{
	tracing_stop_sched_switch(RECORD_CMDLINE);
}

void tracing_start_tgid_record(void)
{
	tracing_start_sched_switch(RECORD_TGID);
}

void tracing_stop_tgid_record(void)
{
	tracing_stop_sched_switch(RECORD_TGID);
}
```

Totam vero fuga doloribus dolor similique, tenetur asperiores vitae ducimus numquam quis quod quo voluptas vel tempore quibusdam odit at earum nobis non molestiae sint maiores! Consequatur laboriosam deleniti fuga!
