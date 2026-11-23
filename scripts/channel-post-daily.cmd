@echo off
rem Scheduled task "MockOnline channel post" runs this daily at 10:00 (Tashkent).
rem Posts today's "free test of the day" to @ReadinMarathons if the approved
rem batch has one; does nothing otherwise, and never posts a day twice.
cd /d "C:\Users\user\ielts-platform"
for %%F in (docs\growth\channel-posts-*.md) do "C:\Program Files\nodejs\node.exe" scripts\channel-post.mjs "%%F" --send today >> docs\growth\channel-post-task.log 2>&1
