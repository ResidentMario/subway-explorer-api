def lambda_handler(event, context):
    import urllib.request
    import boto3
    import os
    import datetime
    from dateutil import tz
    import time

    key = os.environ['mtakey']
    timestamp = datetime.datetime.now().replace(tzinfo=tz.gettz('America/New_York'))
    f_time = str(timestamp).replace(" ", "_")

    s3 = boto3.resource('s3')

    for feed_id in [1, 26, 16, 21, 2, 11, 31, 36]:
        url = "http://datamine.mta.info/mta_esi.php?key={0}&feed_id={1}".format(key, feed_id)
        response = urllib.request.urlopen(url)
        data = response.read()

        if data == b"Permission denied" or response.getcode() == 404:
            # The server is either down or you tried to read during the (non-atomic) write process.
            # Wait and retry.
            time.sleep(5)
            response = urllib.request.urlopen(url)
            data = response.read()
            if data == b"Permission denied" or response.getcode() == 404:
                print("Failed to read from GTFS-Realtime stream {0}".format(feed_id))
                # But the rest might be OK, so move on to trying those.
                continue


        mta_bucket = s3.Bucket('mta-gtfs-{0}'.format(feed_id))
        mta_bucket.put_object(Key='{0}.pb'.format(f_time), Body=data)