import {createStoreModel} from '../F16Stores.js';
export function createDropTankModel({scale=1,capacity=370,withPylon=false}={}){const group=createStoreModel(capacity===300?'fuel300':'fuel370');group.scale.setScalar(scale);return group;}
