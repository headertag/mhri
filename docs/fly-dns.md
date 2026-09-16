# MHRI → Fly.io: GoDaddy DNS

Fly application: **mhri**, organization **pretiola**, region **yyz**.
Application preview: https://mhri.fly.dev/
Canonical production address: https://mhri.net/
Records allocated and verified with Fly on **16 September 2026**.

## 1. Issue certificates before moving traffic

Add these CNAME records in GoDaddy. GoDaddy's **Name** field uses the relative names below, without appending `mhri.net`. Use a TTL of **600 seconds** if available.

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `_acme-challenge` | `mhri.net.xmjzm2n.flydns.net` |
| CNAME | `_acme-challenge.www` | `www.mhri.net.xmjzm2n.flydns.net` |

Leave the existing traffic records in place at this stage. These validation records allow Fly to issue the two certificates through DNS-01 before the site moves. Keep them afterward so certificate renewals remain automatic.

Check issuance:

```bash
flyctl certs check mhri.net --app mhri
flyctl certs check www.mhri.net --app mhri
```

Proceed once both hostnames have an issued certificate. Before traffic changes, Fly may still report that the A/AAAA records do not point to the app; that is expected during this first stage.

## 2. Move traffic to Fly

Replace the four old GitHub Pages A records for `@` with the single A record below. Add the AAAA record and change the existing `www` CNAME to Fly's application-specific target.

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `66.241.125.12` |
| AAAA | `@` | `2a09:8280:1::190:2d2e:0` |
| CNAME | `www` | `xmjzm2n.mhri.fly.dev` |

Remove the old A values `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153` for `@`; retaining them would send some visitors to the old host. Replace `www → headertag.github.io`. A CNAME cannot coexist with A/AAAA records at `www`.

Preserve all mail-related records, including MX, SPF, DKIM and DMARC. No nameserver change or GoDaddy forwarding service is required. Both domains are attached to the same Fly app, and its server redirects `www.mhri.net` to `https://mhri.net`.

## TXT records

**No TXT record is required with the recommended AAAA and ACME CNAME setup above.** Fly also supplied these optional ownership records, for use if ownership verification is later needed behind a proxy or without IPv6:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_fly-ownership` | `app-xmjzm2n` |
| TXT | `_fly-ownership.www` | `app-xmjzm2n` |

Ownership TXT records are public verification values, not API credentials. They do not replace the traffic records or, by themselves, provide pre-cutover DNS-01 certificate validation.

## 3. Verify the switch

```bash
flyctl certs check mhri.net --app mhri
flyctl certs check www.mhri.net --app mhri
curl -I https://mhri.net/
curl -I https://www.mhri.net/
curl -I http://mhri.net/
curl -I http://www.mhri.net/
```

The apex should return 200 over HTTPS; `www` should redirect to the HTTPS apex. HTTP should redirect to HTTPS. Both HTTPS connections must pass certificate validation without `-k` or a browser warning.

The prior GitHub Pages deployment is retained for DNS propagation and rollback, but new pushes deploy only to Fly. The old SSL-check automation is paused. Retire the Pages deployment only after the DNS cutover and HTTPS checks succeed.

Source: [Fly custom-domain and certificate documentation](https://fly.io/docs/networking/custom-domain/). To retrieve the current app-specific values, use `flyctl ips list --app mhri` and `flyctl certs setup HOSTNAME --app mhri`.
