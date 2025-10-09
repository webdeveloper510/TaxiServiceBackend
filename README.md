# TaxiServiceBackend
# car type data and admin commision setting will be added before doing the other functionality in the data after super admin creation

# Redis enable 
sudo systemctl enable redis-server

# Redis restart on server
sudo systemctl restart redis-server

# Check redis status
sudo systemctl status redis-server

# change the configuration file
sudo nano /etc/redis/redis.conf

# restart the redis after chaning the manual password

# Redis CLI
    redis-cli
    auth redis-password
