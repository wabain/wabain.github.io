. as $rev |

if $rev.head_sha != null then
    "\($rev.head_sha)+base:\($rev.base_sha);tree:\($rev.tree)"
else
    "\($rev.sha)+tree:\($rev.tree)"
end
