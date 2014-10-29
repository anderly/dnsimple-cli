# dnsimple-cli command reference
## (subject to change)

    dnsimple
    --------------
        |- account
            |- list
            |- set [account/subscription]
            |- clear
            --------------
            |- env
                |- list
                |- show [environment]
        --------------
    	|- domain
    		|- list [domain|wildcard: e.g. *.com] [-e --expiring]
    		|- add [domain]
    		|- show [domain] [-d --details]
    		|- delete [domain]
    		--------------
    		|- reset [domain]
    		|- push [domain] -email -contact (Move the domain to another account)
    		--------------
    		|- check [domain]
    		|- register [domain]
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
    			|- list [-t --type <type>]
    			|- add
    			|- show
    			|- update
    			|- delete
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
    	--------------
    	|- subscription
    		|- add
    		|- show
    	--------------
    	|- price
    		|- list
