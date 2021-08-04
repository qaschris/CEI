const PulseSdk = require('@qasymphony/pulse-sdk');
const { Webhooks } = require('@qasymphony/pulse-sdk');
const request = require('request');
const xml2js = require('xml2js');

exports.handler = async function({
    event: body,
    constants,
    triggers
}, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    function convertDate(date, offset) {
        let splitDate = date.split('-');
        let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        let month = splitDate[1].toLowerCase();
        console.log('[INFO]: Converting date from: ' + month);
        month = months.indexOf(month) + 1;
        console.log('[DEBUG]: Numeric value of Month: ' + month);
        splitDate.splice(1, 1, month);
        let newDate = new Date(splitDate.join('-'));
        newDate.setHours(newDate.getHours() - offset);
        console.log('[DEBUG]: New date value with timezone adjustment: ' + newDate);
        newDate = newDate.toISOString();
        console.log('[INFO]: Date converted to: ' + newDate);
        return newDate;
    }

    var payload = body;
    var projectId = payload.projectId;
    var cycleId = payload.testcycle;
    var offset = payload.offset;

    let testResults = Buffer.from(payload.result, 'base64').toString('ascii');
    //console.log('[DEBUG]: Results retrieved: \r\n' + testResults);

    let allCsvLines = testResults.trim().split(/\r\n|\n/);
    let headers = allCsvLines[0].split(',');

    let testLogs = [];
    let reportingLog;
    let testStepLogs = [];;
    let stepLog;
    let previousTestCaseName = '';

    for (let l = 1; l < allCsvLines.length; l++) {
        console.log('[DEBUG]: Current line: ' + (l + 1) + ' - ' + allCsvLines[l]);
        let data = allCsvLines[l].split(',');
        console.log('[DEBUG]: Current line record length: ' + data.length);
        if (data.length == headers.length) {
            let currentModuleName = data[0];
            let currentTestCaseName = data[1];
            let currentStepNumber = data[2];
            let currentExecutionStatus = data[3];
            let currentStepName = data[4];
            let currentStepDescription = data[5];
            let currentStartTime = convertDate(data[6], offset);
            let currentEndTime = convertDate(data[7], offset);

            if (currentTestCaseName == previousTestCaseName) {
                // continue test case
                console.log('[INFO]: Test Case Name ' + currentTestCaseName + ' is same as last, continuing with test steps.')
                reportingLog.status = currentExecutionStatus;
                reportingLog.exe_end_date = currentEndTime;

                stepLog = {
                    order: currentStepNumber,
                    description: currentStepName,
                    expected_result: currentStepDescription,
                    actual_result: currentStepDescription,
                    status: currentExecutionStatus
                };

                testStepLogs.push(stepLog);

                previousTestCaseName = currentTestCaseName;

            } else {
                // new test case
                console.log('[INFO]: Test Case Name ' + currentTestCaseName + ' is new, beginning new test case.')
                if (previousTestCaseName !== '') {
                    // push the completed test steps and test case to the collection
                    reportingLog.test_step_logs = testStepLogs;
                    testLogs.push(reportingLog);
                }

                reportingLog = {
                    status: currentExecutionStatus,
                    exe_start_date: currentStartTime,
                    exe_end_date: currentEndTime,
                    module_names: [
                        currentModuleName
                    ],
                    name: currentTestCaseName,
                    automation_content: currentTestCaseName,
                    properties: [],
                    note: ''
                };

                testStepLogs = [];

                stepLog = {
                    order: currentStepNumber,
                    description: currentStepName,
                    expected_result: currentStepDescription,
                    actual_result: currentStepDescription,
                    status: currentExecutionStatus
                };

                testStepLogs.push(stepLog);

                previousTestCaseName = currentTestCaseName;
            }

        } else {
            console.log('[ERROR]: CSV content on row ' + l + ' does not have the same number of columns as the header row.');
            return '[ERROR]: CSV content on row ' + l + ' does not have the same number of columns as the header row.';
        }

    }

    let formattedResults = {
        "projectId": projectId,
        "testcycle": cycleId,
        "logs": testLogs
    };

    emitEvent('UpdateQTestWithFormattedResults', formattedResults);
}
