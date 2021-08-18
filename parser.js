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
    var filename = payload.filename;
    var offset = payload.offset;

    let testResults = Buffer.from(payload.result, 'base64').toString('ascii');
    //console.log('[DEBUG]: Results retrieved: \r\n' + testResults);

    let allCsvLines = testResults.trim().split(/\r\n|\n/);
    let headers = allCsvLines[0].split(',');

    let testLogs = [];
    let reportingLog;
    let testStepLogs = [];;
    let stepLog;
    let data;
    let previousTestCaseName = '';
    let currentModuleName;
    let currentTestCaseName;
    let currentStepNumber;
    let currentExecutionStatus;
    let currentStepName;
    let currentStepDescription;
    let currentStartTime;
    let currentEndTime;
    let corruptRecordFlag = false;

    console.log('[INFO]: Processing file: ' + filename);
    for (let l = 1; l < allCsvLines.length; l++) {
        data = allCsvLines[l].split(',');
        console.log('[INFO]: Current line: ' + (l + 1) + ' - ' + allCsvLines[l] + ' Record length: ' + data.length);
        if (data.length == headers.length) {
            currentModuleName = data[0];
            currentTestCaseName = data[1];
            currentStepNumber = data[2];
            currentExecutionStatus = data[3];
            currentStepName = data[4];
            currentStepDescription = data[5];
            currentStartTime = convertDate(data[6], offset);
            currentEndTime = convertDate(data[7], offset);

            if (corruptRecordFlag == true && currentTestCaseName == previousTestCaseName) {
                console.log('[INFO]: Row is part of corrupted record, skipping to next.');
            } else if (corruptRecordFlag == false && currentTestCaseName == previousTestCaseName) {
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
                if (corruptRecordFlag == false && previousTestCaseName !== '') {
                    // push the completed test steps and test case to the collection
                    reportingLog.test_step_logs = testStepLogs;
                    testLogs.push(reportingLog);
                } else if (corruptRecordFlag == true && previousTestCaseName !== '') {
                    // push the completed test steps and test case to the collection
                    corruptRecordFlag = false;
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
            console.log('[ERROR]: CSV content of file ' + filename + ' on row ' + (l + 1) + ' does not have the same number of columns as the header row, skipping to next record.');
            emitEvent('ChatOpsEvent', {message: '[ERROR]: CSV content of file ' + filename + ' on row ' + (l + 1) + ' does not have the same number of columns as the header row, skipping to next record.'});
            corruptRecordFlag = 'true';
        }
    }

    let formattedResults = {
        "projectId": projectId,
        "testcycle": cycleId,
        "logs": testLogs
    };

    emitEvent('Upload2qTest', formattedResults);
}
