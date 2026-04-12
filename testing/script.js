/***
 * This script is used to test the URL shortening service. 
 * It sends a POST request to the /shorten endpoint with a long URL and 
 * prints the shortened URL returned by the service.
 * 
 * store the response from the POST request, which contains the shortened URL, and then 
 * sends a GET request to that shortened URL to verify that it redirects to the original long URL.
 * 
 */

// workload model 

/**
 * Post : 5 %
 * GET: 95 %
 */


import k6 from 'k6';
import http, { post } from 'k6/http';

import { Counter } from 'k6/metrics';

const POST_COUNTER = new Counter('post_requests');
const GET_COUNTER = new Counter('get_requests');

const Long_URLs = [
    'https://www.example.com/very/long/url/1',
    'https://www.example.com/very/long/url/2',
    'https://www.example.com/very/long/url/3',
    'https://www.example.com/very/long/url/4',
    'https://www.example.com/very/long/url/5'
];


export const options = {


    scenarios: {
        postScenario: {
            executor: 'ramping-arrival-rate',
            exec: 'postScenario',
            startRate: 500, // 5 iterations per second
            timeUnit: '1s', // per second

            stages: [
                { target: 100, duration: '30s' },
                { target: 300, duration: '30s' },
                { target: 500, duration: '30s' },
                { target: 500, duration: '2m' },
                { target: 300, duration: '1m' },
                { target: 0, duration: '30s' }

            ],

            preAllocatedVUs: 20, // pre-allocate 10 VUs to handle the load
            maxVUs: 40, // allow up to 20 VUs if needed

        },
        getScenario: {
            executor: 'ramping-arrival-rate',
            exec: 'getScenario',
            startRate: 950, // 95 iterations per second
            timeUnit: '1s', // per second
            stages: [
                { target: 1000, duration: '30s' },
                { target: 5000, duration: '30s' },
                { target: 9500, duration: '30s' },
                { target: 9500, duration: '2m' },
                { target: 1000, duration: '1m' },
                { target: 0, duration: '30s' }

            ],

            preAllocatedVUs: 100, // pre-allocate 50 VUs to handle the load
            maxVUs: 500, // allow up to 100 VUs if needed            
        },
    },
}



export function postScenario(data) {



    const longURL = Long_URLs[Math.floor(Math.random() * Long_URLs.length)];
    const res = http.post('http://localhost:8080/url', JSON.stringify({ 'original_url': longURL }), {
        headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 201) {

        console.log(res.json().shortened_url);
    } else {
        console.log(`Failed to shorten URL: ${longURL}`);
    }

    POST_COUNTER.add(1);
}

export function getScenario(data) {


    if (data.shortenURLs.length > 0) {
        const shortenURL = data.shortenURLs[Math.floor(Math.random() * data.shortenURLs.length)];
        const res = http.get(shortenURL);
        if (res.status === 200) {
            console.log(`Successfully accessed shortened URL: ${shortenURL}`);
        } else {
            console.log(`Failed to access shortened URL: ${shortenURL}`);
        }
    } else {
        console.log('No shortened URLs available to test GET requests.');
    }
    GET_COUNTER.add(1);

}

export function setup() {



    const shortenURLs = []

    console.log('Setting up the test environment...');

    // call 100 POST requests to the /shorten endpoint to populate the shortenURLs array
    for (let i = 0; i < 100; i++) {
        const longURL = Long_URLs[Math.floor(Math.random() * Long_URLs.length)];
        const res = http.post('http://localhost:8080/url', JSON.stringify({ 'original_url': longURL }), {
            headers: { 'Content-Type': 'application/json' },
        });
        if (res.status === 201) {
            const shortenURL = res.json().shortened_url;
            shortenURLs.push(shortenURL);
        } else {
            console.log(`Failed to shorten URL: ${longURL} `);
        }
    }


    return { shortenURLs };

}

export function teardown(data) {


    // console log the shortenURLs array to verify that it contains the shortened URLs

    console.log('Tear down the test environment...');
    console.log('Shortened URLs: ', data.shortenURLs);
    console.log('Shortened URLs: ', data.shortenURLs.length);
}




