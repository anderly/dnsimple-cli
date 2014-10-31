# dnsimple-cli command reference
## (subject to change)

    dnsimple (dns)
    --------------
        |- login  (Log in to a DNSimple account)
        |- logout  [username] [-u --username <username>] (Log out from DNSimple)
        |- portal [-e --environment <environment>] (Open the DNSimple portal in a browser)
        |- account
            |- list (List the currently authenticated accounts)
            |- show [account email/subscription id] (Show details about an account)
            |- set <account email/subscription id> (Set the current account)
            |- clear (Remove an account or environment, or clear all of the stored account and environment info)
            --------------
            |- env
                |- list (List the environments')
                |- show [environment] [--environment <environment>] (Show an environment)
        --------------
    	|- domain
    		|- list [domain|wildcard: e.g. *.com] [-e --expiring]
    		|- add [domain]
    		|- show [domain] [-d --details]
    		|- delete [domain]
    		--------------
    		|- reset [domain]
    		|- push [-u --useremail <useremail>] [-c --contactid <contactid>] [domain] (Move a domain to another account)
    		--------------
    		|- check [domains] (Check availability of one or more domains)
    		|- register [-c --contactid <contactid>] [domain]
    		|- transfer (in) [domain]
    		|- renew [domain]
    		|- transferout [domain]
    		|- autorenew [domain] -enable [true|false]
    		--------------
    		|- member
    			|- list
    			|- add
    			|- delete
    		--------------
    		|- record
    			|- list [-t --type <type>] [-f --filter <filter>] [domain]
    			|- add [-r --recordname <recordname>] [-t --type <type>] [-c --content <content>] [domain]
    			|- show [-i --id recordid] [domain]
    			|- update [-i --id recordid] [-r --recordname <recordname>] [-t --type <type>] [-c --content <content>]  [domain]
    			|- delete [-i --id recordid] [domain]
    		--------------
    		|- ns (name server)
    			|- update
    			|- register (add)
    			|- unregister (delete)
    		--------------
    		|- vns (vanity name server)
    			|- enable
    			|- disable
    		--------------
    		|- whois [true|false] (WHOIS privacy)
    		--------------
    		|- cert (ssl)
    			|- list
    			|- add (purchase/buy)
    			|- show
    			|- configure
    			|- submit (update)
    		--------------
    		|- email (email forwards)
    			|- list
    			|- add
    			|- delete
    		--------------
    		|- zone
    			|- import
    			|- export
    	--------------
    	|- contact
    		|- list
    		|- add
    		|- show
    		|- update
    		|- delete
    	--------------
    	|- service
    		|- list
    		|- show
    	--------------
    	|- template
    		|- list
    		|- add
    		|- show
    		|- delete
    	--------------
    	|- extattr
    		|- list
    	--------------
    	|- user
            |- add
    	--------------
    	|- subscription
    		|- add
    		|- show
    	--------------
    	|- price
    		|- list
