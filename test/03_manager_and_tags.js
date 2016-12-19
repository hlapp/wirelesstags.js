"use strict";

var tagManager;
var credentialsMissing = true;
var tags = [];

/*
 * Test functions of the tag manager object
 */

describe('WirelessTagManager:', function() {

    var WirelessTagManager,
        WirelessTagPlatform,
        WirelessTag,
        platform;

    before('load and connect to platform, find tag manager(s)', function(done) {
        WirelessTagPlatform = require('../');
        WirelessTagManager = require('../lib/tagmanager.js');
        WirelessTag = require('../lib/tag.js');

        // create platform object, register listeners
        platform = WirelessTagPlatform.create();
        platform.on('discover', (manager) => {
            // right now we only need one tag manager for testing
            if (tagManager === undefined) tagManager = manager;
            done();
        });

        // load connection options, then connect
        let connOpts = WirelessTagPlatform.loadConfig();
        if ((connOpts.username && connOpts.password) || connOpts.bearer) {
            credentialsMissing = false;
            platform.connect(connOpts).then(
                (pf) => { pf.discoverTagManagers(); }
            ).catch((e) => { console.error(e.stack ? e.stack : e); throw e; });
        } else {
            // signal we're done - without connecting there's no discovering
            done();
        }
    });

    describe('#mac', function() {
        it('a string, its (unique) MAC address', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.mac).to.be.a('string').
                and.to.have.length.within(10,14);     // 12 in theory?
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tagManager.mac = "JX"; }).to.throw(TypeError);
        });
    });
    describe('#name', function() {
        it('a string, its (user-assigned) name', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(tagManager.name).to.be.a('string').
                and.to.not.be.empty;
        });
    });
    describe('#online', function() {
        it('a boolean, whether it is online', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.online).to.be.a('boolean');
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tagManager.online = false; }).to.throw(TypeError);
        });
    });
    describe('#selected', function() {
        it('a boolean, whether it is currently selected', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.selected).to.be.a('boolean');
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tagManager.selected = false; }).to.throw(TypeError);
        });
    });
    describe('#wirelessConfig', function() {
        it('an object, wireless communication settings', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.wirelessConfig).to.be.a('object');
        });
        it('should have at least a certain list of properties', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.wirelessConfig).to.have.all.keys(
                'dataRate',
                'activeInterval',
                'Freq',
                'useCRC16',
                'useCRC32',
                'psid');
        });
    });
    describe('#radioId', function() {
        it('a string, its (unique?) radio identity (freq band?)', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(tagManager.radioId).to.be.a('string').
                and.to.not.be.empty;
        });
        it('should convert to a float between 100-200', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            // normally these are around 150
            expect(Number(tagManager.radioId)).to.be.within(100,200);
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tagManager.radioId = 0; }).to.throw(TypeError);
        });
    });
    describe('#rev', function() {
        it('a number, should be its revision', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(tagManager.rev).to.be.a('number').
                and.to.be.below(256);     // byte
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tagManager.rev = 0; }).to.throw(TypeError);
        });
    });

    describe('#select()', function() {
        it('should promise to select it for API calls - happens automatically',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();
               
               return expect(tagManager.select()).
                   to.eventually.equal(tagManager);
           });
        it('property "selected" should be true afterwards', function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();
               
               return expect(tagManager.selected).to.be.true;
        });
    });

    describe('#discoverTags()', function() {
        let discoverSpy = sinon.spy();
        
        it('should promise an array of tags associated with it', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tagManager.on('discover', discoverSpy);
            tagManager.on('discover', (tag) => {
                tags.push(tag);
            });
            return expect(tagManager.discoverTags()).
                to.eventually.satisfy((tags) => {
                    return tags.reduce((state, tag) => {
                        return state && (tag instanceof WirelessTag);
                    }, tags.length > 0);
                });
        });
        it('should emit "discover" event for each associated tag', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(discoverSpy).to.have.always.been.calledWith(
                sinon.match.instanceOf(WirelessTag));
        });
    });

});

/*
 * Test functions of the tag object
 */

describe('WirelessTag:', function() {

    var WirelessTagSensor;
    var WirelessTag;
    var focusTag;
    var tagToReset;
    var origUpdateInterval;
    const testInterval = 30;
    const testUpdateLoops = 2;

    before('load modules', function() {
        WirelessTagSensor = require('../lib/sensor.js');
        WirelessTag = require('../lib/tag.js');

        // find the tag with the most recent time of last update
        focusTag = tags[0];
        tags.forEach((t) => {
            if (t.lastUpdated() > focusTag.lastUpdated()) focusTag = t;
        });
    });

    after('reset update interval if it was changed', function() {
        this.timeout(15 * 1000);
        if (origUpdateInterval
            && (tagToReset.updateInterval !== origUpdateInterval)) {
            return tagToReset.setUpdateInterval(origUpdateInterval);
        }
    });

    describe('#uuid', function() {
        it('a string, its unique identifier as a UUID', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => { return tag.uuid }).forEach((value) => {
                expect(value).to.be.a('string').and.have.lengthOf(36);
            });
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tags[0].uuid = "xzy"; }).to.throw(TypeError);
        });
    });

    describe('#name', function() {
        it('a string, its (user-assigned) name', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => { return tag.name }).forEach((value) => {
                return expect(value).to.be.a('string').and.to.not.be.empty;
            });
        });
    });

    describe('#slaveId', function() {
        it("a number, its unique 8-bit number among the tag manager's tags",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               tags.map((tag) => { return tag.slaveId }).forEach((value) => {
                   return expect(value).to.be.a('number').and.to.be.below(256);
               });
           });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tags[0].slaveId = -1; }).to.throw(TypeError);
        });
    });

    describe('#alive', function() {
        it('a boolean, whether it is "alive"', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => { return tag.alive }).forEach((value) => {
                return expect(value).to.be.a('boolean');
            });
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tags[0].alive = false; }).to.throw(TypeError);
        });
    });

    describe('#tagType', function() {
        it('a number, an 8-bit code for its hardware type', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => { return tag.tagType }).forEach((value) => {
                return expect(value).to.be.a('number').and.to.be.below(256);
            });
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tags[0].tagType = 0; }).to.throw(TypeError);
        });
    });

    describe('#rev', function() {
        it('a number, an 8-bit code for its hardware revision', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => { return tag.rev }).forEach((value) => {
                return expect(value).to.be.a('number').and.to.be.below(256);
            });
        });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(() => { tags[0].rev = 0; }).to.throw(TypeError);
        });
    });

    describe('#updateInterval', function() {
        it('a number, interval between updates in seconds', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => {
                return tag.updateInterval;
            }).forEach((value) => {
                return expect(value).to.be.a('number').and.to.be.within(10,
                                                                        7200);
            });
        });
    });

    describe('#sensorCapabilities()', function() {
        it('array of strings, sensor types the tag has', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => {
                return tag.sensorCapabilities();
            }).forEach((value) => {
                return expect(value).to.satisfy((caps) => {
                    return caps.reduce((state, cap) => {
                        return state && ('string' === typeof cap);
                    }, caps.length > 0);
                });
            });
        });
    });

    describe('#hardwareFacts()', function() {
        it('array of facts that return true for the tag', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.forEach((tag) => {
                expect(tag.hardwareFacts()).to.satisfy((feats) => {
                    return feats.reduce((state, feat) => {
                        return state
                            && ('string' === typeof feat)
                            && (tag[feat]() === true);
                    }, feats.length > 0);
                });
            });
        });
    });

    describe('#lastUpdated()', function() {
        it('a Date, time when the tag data were last updated', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.map((tag) => {
                return tag.lastUpdated();
            }).forEach((theDate) => {
                return expect(theDate).to.be.instanceOf(Date);
            });
        });
        it('should not be much older than the updateInterval', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tags.forEach((tag) => {
                expect(tag.lastUpdated().getTime()).
                    to.be.at.least(Date.now()
                                   - tag.updateInterval * 1000
                                   - 55 * 1000 /* time cloud is about behind */
                                   - 10 * 1000 /* 10 seconds tolerance */ );
            });
        });
    });

    describe('#update()', function() {
        let dataSpy = sinon.spy();
        let tag;

        it("should promise tag with data updated to latest in cloud",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               // initialize a new object with only the slaveId set, then
               // test whether it gets its data updated
               tag = new WirelessTag(tagManager,
                                     { slaveId: focusTag.slaveId });
               tag.on('data', dataSpy);

               return expect(tag.update()).to.eventually.satisfy((t) => {
                   return (t.lastUpdated() - tag.lastUpdated()) === 0;
               });
           });
        it('should emit \'data\' event if data is updated', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tag.removeListener('data', dataSpy);
            return expect(dataSpy).to.have.been.calledOnce;
        });
        it("should promise tag with same data if already latest in cloud",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let prevUpdated = tag.lastUpdated();
               dataSpy = sinon.spy();
               tag.on('data', dataSpy);

               return expect(tag.update()).to.eventually.satisfy((t) => {
                   return (t.lastUpdated() - prevUpdated) === 0;
               });
           });
        it('should not emit \'data\' event if data did not change', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            return expect(dataSpy).to.not.have.been.called;
        });
    });

    describe('#liveUpdate()', function() {
        let dataSpy = sinon.spy();
        let discoverSpy = sinon.spy();
        let tag;

        it("should promise tag updated to current data from actual tag",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               // allow more time for this test - sometimes needed
               this.timeout(8 * 1000);

               tag = focusTag;
               let prevUpdated = tag.lastUpdated();
               tag.on('data', dataSpy);
               tag.on('discover', discoverSpy);

               return expect(tag.liveUpdate()).to.eventually.satisfy((t) => {
                   return t.lastUpdated() > prevUpdated;
               });
           });
        it('should emit \'data\' event due to data update', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tag.removeListener('data', dataSpy);
            return expect(dataSpy).to.have.been.calledOnce;
        });
        it('should not trigger sensor discovery', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tag.removeListener('discover', discoverSpy);
            return expect(discoverSpy).to.not.have.been.called;
        });
    });

    describe('#setUpdateInterval()', function() {
        let dataSpy = sinon.spy();
        let tag;

        it("should promise tag with changed \'updateInterval\'",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               // find the most out of date tag
               tag = tags[0];
               tags.forEach((t) => {
                   if (t.lastUpdated() < tag.lastUpdated()) tag = t;
               });
               tag.on('data', dataSpy);

               focusTag = tag;
               origUpdateInterval = focusTag.updateInterval;
               tagToReset = focusTag;

               // this call can take some time, so be generous with timeout
               this.timeout(15 * 1000);

               return expect(tag.setUpdateInterval(testInterval)).
                   to.eventually.satisfy((t) => {
                       return t.updateInterval === testInterval;
                   });
           });
        it('should emit \'data\' event due to data update', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tag.removeListener('data', dataSpy);
            return expect(dataSpy).to.have.been.calledOnce;
        });
    });

    describe('#startUpdateLoop()', function() {
        let dataSpy = sinon.spy();
        let tag;
        let dataHandler;

        it("should commence auto-update loop for tag",
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               tag = focusTag;

               return expect(tag.startUpdateLoop()).to.be.ok;
           });
        it("should result in data updated in regular intervals",
           function(done) {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               this.timeout(testInterval * 1000 * (testUpdateLoops + 0.5));
                                                   // allow for max 50% padding
               let lastUpdate = tag.lastUpdated();
               dataHandler = (t) => {
                   dataSpy(t, t.lastUpdated(), lastUpdate);
                   lastUpdate = t.lastUpdated();
               };
               tag.on('data', dataHandler);

               setTimeout(() => {
                   done();
               }, testInterval * 1000 * (testUpdateLoops + 0.2));

           });
        it('should emit \'data\' events about every updateInterval seconds',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               // allow between -10 to +5 seconds of update interval
               let elapsedMin = testInterval * 1000;
               if (elapsedMin > 15000) elapsedMin -= 15000;
               let elapsedMax = testInterval * 1000 + 5000;
               tag.removeListener('data', dataHandler);
               expect(dataSpy.callCount).to.be.within(testUpdateLoops,
                                                      testUpdateLoops * 2);
               // we ignore the first call here - its timing is often off
               for (let n = 1; n < dataSpy.callCount; n++) {
                   let spyCall = dataSpy.getCall(n);
                   let updatedAt = spyCall.args[1];
                   let prevUpdate = spyCall.args[2];
                   expect(updatedAt - prevUpdate).to.be.within(elapsedMin,
                                                               elapsedMax);
               }
           });
    });

    describe('#stopUpdateLoop()', function() {
        let dataSpy = sinon.spy();
        let tag;

        it("should stop auto-update loop for tag",
           function(done) {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               tag = focusTag;
               tag.stopUpdateLoop();
               tag.on('data', dataSpy);

               this.timeout(testInterval * 1000 + 10000); // 10 seconds padding

               let testAndCleanup = (t) => {
                   t.removeListener('data', dataSpy);
                   try {
                       expect(dataSpy).to.have.callCount(0);
                   }
                   finally {
                       done();
                   }
               };
               // wait for one more update cycle to test that updates stopped
               let timer = setTimeout(() => {
                   tag.removeListener('data', dataHandler);
                   testAndCleanup(tag);
               }, testInterval * 1000 + 5000); // adds 5 seconds to interval

               // fail right away if there is an update
               let dataHandler = (t) => {
                   clearTimeout(timer);
                   testAndCleanup(t);
               };
               tag.once('data', dataHandler);
           });
    });

    describe('#discoverSensors()', function() {
        let discoverSpy = sinon.spy();
        let sensors = [];
        let numSensors = 0;
        let tag;

        it("should promise an array of the tag's sensors", function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            tag = tags[0]; // choose the tag with the most sensors
            let l = tag.sensorCapabilities.length;
            for (let t of tags) {
                if (t.sensorCapabilities().length > l) {
                    tag = t;
                }
            }

            tag.on('discover', discoverSpy);
            tag.on('discover', (sensor) => {
                sensors.push(sensor);
            });
            return expect(tag.discoverSensors()).
                to.eventually.satisfy((s_arr) => {
                    numSensors = s_arr.length; // store for subsequent testing
                    return s_arr.reduce((state, sensor) => {
                        return state && (sensor instanceof WirelessTagSensor);
                    }, s_arr.length > 0);
                });
        });
        it('should emit "discover" event for each new sensor', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            expect(discoverSpy).to.have.always.been.calledWith(
                sinon.match.instanceOf(WirelessTagSensor));
        });
        it('initially all the tag\'s sensors are new and trigger "discover"',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               expect(discoverSpy).to.have.callCount(numSensors);
           });
        it("should promise all of tag's sensors when called again", function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            // reset the event callback spy for next test
            tag.removeAllListeners('discover');
            discoverSpy = sinon.spy();
            tag.on('discover', discoverSpy);

            return expect(tag.discoverSensors()).
                to.eventually.have.lengthOf(numSensors);
        });
        it('should not emit "discover" on sensors discovered previously',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               return expect(discoverSpy).to.not.have.been.called;
           });
    });

});

/*
 * Test functions of the sensor object
 */

describe('WirelessTagSensor:', function() {

    var sensors;

    before('find and distill list of sensors for testing', function(done) {
        // gather up a list of sensors that are all different, regardless
        // of the tag they belong to
        let proms = [];
        tags.forEach((tag) => {
            let sensorList = tag.eachSensor();
            if (sensorList.length > 0) {
                proms.push(Promise.resolve(sensorList));
            } else {
                proms.push(tag.discoverSensors());
            }
        });
        Promise.all(proms).then(
            (sensorLists) => {
                let sensorTypeMap = {};
                let sensorList = [];
                sensorLists.forEach((list) => {
                    sensorList = sensorList.concat(list);
                });
                sensors = [];
                sensorList.forEach((sensor) => {
                    let key = sensor.sensorType;
                    let tag = sensor.wirelessTag;
                    if (tag.isPhysicalTag()) key += '-phys';
                    switch (sensor.sensorType) {
                    case 'motion':
                    case 'event':
                        if (tag.hasAccelerometer()) key += "-accel";
                        if (tag.canMotionTimeout()) key += "-hmc";
                        break;
                    case 'temp':
                        if (tag.isHTU()) key += '-htu';
                        break;
                    }
                    if (!sensorTypeMap[key]) {
                        sensorTypeMap[key] = true;
                        sensors.push(sensor);
                    }
                });
                done();
            }).catch((e) => { console.error(e.stack ? e.stack : e); done(); });

    });

    describe('#reading', function() {
        let readingTypeMap = {
            'number': ['temp','humidity','moisture','light','signal','battery'],
            'string': ['event'],
            'boolean': ['water','outofrange']
        };
        let toTest;

        Object.keys(readingTypeMap).forEach(function(readingType) {
            it('should be a ' + readingType + ' for '
               + readingTypeMap[readingType] + ' sensors',
               function() {
                   // skip this if we don't have connection information
                   if (credentialsMissing) return this.skip();

                   toTest = sensors.filter((s) => {
                       return readingTypeMap[readingType].
                           indexOf(s.sensorType) >= 0;
                   });
                   // skip if there is nothing to test
                   if (toTest.length === 0) this.skip();

                   toTest.map((sensor) => {
                       return sensor.reading;
                   }).forEach((value) => {
                       expect(value).to.be.a(readingType);
                   });
               });
            it('should be read-only for these', function() {
                // skip this if we don't have connection information
                if (credentialsMissing) return this.skip();
                // skip if there is nothing to test
                if (toTest.length === 0) this.skip();

                return expect(() => {
                    toTest[0].reading = "xzy";
                }).to.throw(TypeError);
            });
        });
    });

    describe('#eventState', function() {
        let toTest;

        it('should be a string except for motion and signal sensors',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               toTest = sensors.filter((s) => {
                   return ['motion','signal'].indexOf(s.sensorType) < 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.eventState;
               }).forEach((value) => {
                   return expect(value).to.be.a('string');
               });
           });
        it('should be read-only for these', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();
            // skip if there is nothing to test
            if (toTest.length === 0) this.skip();

            return expect(() => {
                toTest[0].eventState = "xzy";
            }).to.throw(TypeError);
        });
        it('should be undefined for motion and signal sensors', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();

            toTest = sensors.filter((s) => {
                return ['motion','signal'].indexOf(s.sensorType) >= 0;
            });
            // skip if there is nothing to test
            if (toTest.length === 0) this.skip();

            toTest.map((sensor) => {
                return sensor.eventState;
            }).forEach((value) => {
                return expect(value).to.be.undefined;
            });
        });
    });

    describe('#eventStateValues', function() {
        let toTest;

        it('should be list of possible values for \'eventState\'',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               toTest = sensors.filter((s) => {
                   return ['motion','signal'].indexOf(s.sensorType) < 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return [sensor.eventStateValues, sensor.eventState];
               }).forEach((value) => {
                   return expect(value[0]).to.be.an('array').
                       and.to.include(value[1]);
               });
           });
        it('should be read-only', function() {
            // skip this if we don't have connection information
            if (credentialsMissing) return this.skip();
            // skip if there is nothing to test
            if (toTest.length === 0) this.skip();

            return expect(() => {
                toTest[0].eventStateValues = ["xzy"];
            }).to.throw(TypeError);
        });
    });

    describe('#isArmed()', function() {
        it('should be a boolean except for motion and signal sensors',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.eventState !== undefined;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.filter((s) => {
                   return s.eventState !== undefined;
               }).forEach((sensor) => {
                   return expect(sensor.isArmed()).to.be.a('boolean');
               });
           });
    });

    describe('#monitoringConfig()', function() {

        it('should be an object giving the tag\'s monitoring configuration',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               sensors.map((sensor) => {
                   return sensor.monitoringConfig();
               }).forEach((mconfig) => {
                   return expect(mconfig).to.be.a('object');
               });
           });

        it('should have \'notifySettings\' unless signal sensor',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.wirelessTag.isPhysicalTag()
                       && s.sensorType !== 'signal';
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().notifySettings;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('email',
                                               'useEmail',
                                               'usePush',
                                               'useSpeech',
                                               'sound',
                                               'noSound');
               });
           });

        it('should have \'thresholds\' for temp, light, humidity, moisture, current',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['current','humidity','light','moisture','temp'].
                       indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().thresholds;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('lowValue',
                                               'minLowReadings',
                                               'highValue',
                                               'minHighReadings',
                                               'hysteresis');
               });
           });

        it('should have only \'thresholds.lowValue\' for battery',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.sensorType === 'battery';
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().thresholds;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.have.all.keys('lowValue');
               });
           });

        it('should have \'responsiveness\' for motion, event, humidity, moisture',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['humidity','event','moisture','motion'].
                       indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().responsiveness;
               }).forEach((value) => {
                   return expect(value).to.be.oneOf(["Highest",
                                                     "Medium high",
                                                     "Medium",
                                                     "Medium low",
                                                     "Lowest"]);
               });
           });

        it('should have \'monitoringInterval\' for temp and light',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['light','temp'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().monitoringInterval;
               }).forEach((value) => {
                   return expect(value).to.be.a('number').
                       and.to.be.above(0);
               });
           });

        it('should have \'monitoringEnabled\' for battery',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.sensorType === 'battery';
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().monitoringEnabled;
               }).forEach((value) => {
                   return expect(value).to.be.a('boolean');
               });
           });

        it('should have \'isDoorMode\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().isDoorMode;
               }).forEach((value) => {
                   return expect(value).to.be.a('boolean');
               });
           });

        it('should have \'doorMode\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().doorMode;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('angle',
                                               'notifyWhenOpenFor',
                                               'notifyOnClosed');
               });
           });

        it('should have \'motionMode\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().motionMode;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('timeoutOrResetAfter',
                                               'timeoutMode');
               });
           });

        it('should have \'orientation1\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().orientation1;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('x','y','z');
               });
           });

        it('should have \'sensitivity\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().sensitivity;
               }).forEach((value) => {
                   return expect(value).to.be.a('number').
                       and.to.be.above(0);
               });
           });

        it('should have \'armSilently\' for event and motion',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['event','motion'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().armSilently;
               }).forEach((value) => {
                   return expect(value).to.be.a('boolean');
               });
           });

        it('should have \'calibration\' for humidity and moisture',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return ['humidity','moisture'].indexOf(s.sensorType) >= 0;
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().calibration;
               }).forEach((value) => {
                   return expect(value).to.be.an('object').
                       and.to.contain.all.keys('lowValue',
                                               'lowCapacitance',
                                               'highValue',
                                               'highCapacitance');
               });
           });

        it('should have \'unit\' for temp, which should be degC',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.sensorType === 'temp';
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().unit;
               }).forEach((value) => {
                   return expect(value).to.be.a('string').and.to.equal('degC');
               });
           });

        it('should have \'gracePeriod\' for outofrange',
           function() {
               // skip this if we don't have connection information
               if (credentialsMissing) return this.skip();

               let toTest = sensors.filter((s) => {
                   return s.sensorType === 'outofrange';
               });
               // skip if there is nothing to test
               if (toTest.length === 0) this.skip();

               toTest.map((sensor) => {
                   return sensor.monitoringConfig().gracePeriod;
               }).forEach((value) => {
                   return expect(value).to.be.a('number').
                       and.to.be.above(10);
               });
           });
    });

});
