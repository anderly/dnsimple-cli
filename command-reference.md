# dnsimple-cli command reference
## (subject to change)

    dnsimple
    --------------
        |- account
            |- list
            |- set [account/subscription]
            --------------
            |- env
                |- list
                |- show [environment]
        --------------
    	|- domain
    		|- list
    		|- add [domain]
    		|- show [domain]
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
    			|- list
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
    	|- services
    		|- list
    		|- show
    	--------------
    	|- template
    		|- list
    		|- add
    		|- show
    		|- delete
    	--------------
    	|- extendedattributes
    		|- list
    	--------------
    	|- users
    	--------------
    	|- subscription
    		|- add
    		|- show
    	--------------
    	|- price
    		|- list
