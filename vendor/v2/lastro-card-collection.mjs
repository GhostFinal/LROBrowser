/**
 * LastRO card collection data and protocol helpers.
 *
 * The table is copied from the v1 Card_Connection_db2 database. Runtime state
 * is cloned per client so server updates never mutate the source table.
 */
export const CARD_CONNECTION_TABS = Object.freeze([
  { id: 0, label: "我的卡组" },
  { id: 1, label: "头饰" },
  { id: 2, label: "铠甲" },
  { id: 3, label: "武器" },
  { id: 4, label: "盾牌" },
  { id: 5, label: "披肩" },
  { id: 6, label: "鞋类" },
  { id: 7, label: "饰品" }
]);

export const CARD_CONNECTION_PACKET_IDS = Object.freeze({
  recharge: 2775,
  addDeck: 2785,
  cancel: 2787,
  activate: 2777,
  enable: 2779,
  rechargeList: 2774,
  rechargeUpdate: 2776,
  activateUpdate: 2794,
  enableUpdate: 2780,
  cancelUpdate: 2793
});

// LastRO emits these ordinary inventory packets immediately after the same
// 0x0ad6 two-byte marker that is reused by the card-list packet.  Their IDs
// must be accepted before the card header has a fifth byte available.
// 0x0b0a is intentionally not listed: the captured 2826-byte card frame has
// that exact prefix, so only complete card-body validation can disambiguate it.
const CARD_CONNECTION_MARKER_FOLLOWER_PACKET_IDS = new Set([0x0b09, 0x0b39]);

/**
 * Read the declared length from a card-list-style four-byte prefix.
 * Structural validation is performed by the candidate/frame helpers below.
 */
export function getCardConnectionRechargeListFrameLength(buffer, offset = 0) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > bytes.byteLength) return null;
  const id = bytes[offset] | (bytes[offset + 1] << 8);
  if (id !== CARD_CONNECTION_PACKET_IDS.rechargeList) return null;
  const frameLength = bytes[offset + 2] | (bytes[offset + 3] << 8);
  return frameLength >= 5 ? frameLength : null;
}

/**
 * Decide whether a 0x0ad6 packet is still a plausible card-list candidate.
 *
 * The same bytes can be a LastRO stream marker followed by an ordinary
 * variable-length inventory packet.  Real card-list frames always advertise
 * the eight card categories, so use that fixed header before buffering an
 * incomplete frame.  The two common inventory followers are handled even
 * when only their packet ID has arrived in the current legacy transport chunk.
 */
export function isCardConnectionRechargeListCandidate(buffer, offset = 0) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset + 2 > bytes.byteLength) return false;
  const id = bytes[offset] | (bytes[offset + 1] << 8);
  if (id !== CARD_CONNECTION_PACKET_IDS.rechargeList) return false;

  if (offset + 4 > bytes.byteLength) return true;

  const frameLength = getCardConnectionRechargeListFrameLength(bytes, offset);
  if (frameLength === null || frameLength < 21) return false;
  if (offset + 5 > bytes.byteLength) {
    const followerId = bytes[offset + 2] | (bytes[offset + 3] << 8);
    return !CARD_CONNECTION_MARKER_FOLLOWER_PACKET_IDS.has(followerId);
  }
  return bytes[offset + 4] === CARD_CONNECTION_TABS.length;
}

/**
 * Infer the slot value width for a complete card-list frame.
 *
 * LastRO also uses 0x0AD6 as a two-byte stream marker. The card-list packet
 * is length-prefixed, so validate the complete class/level layout before the
 * receiver treats 0x0AD6 as a business packet.
 */
export function getCardConnectionRechargeListValueSize(buffer, offset = 0, packetver = 20180704) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset + 5 > bytes.byteLength) return null;
  const frameLength = getCardConnectionRechargeListFrameLength(bytes, offset);
  if (frameLength === null || offset + frameLength > bytes.byteLength) return null;
  const classCount = bytes[offset + 4];
  if (!classCount || classCount > 32) return null;

  const preferredSize = Number(packetver) >= 20180704 ? 4 : 1;
  const candidates = [...new Set([preferredSize, 2, 1, 4])];
  for (const valueSize of candidates) {
    let cursor = offset + 5;
    let valid = true;
    for (let classIndex = 0; classIndex < classCount; classIndex++) {
      if (cursor + 2 > offset + frameLength) {
        valid = false;
        break;
      }
      const levelCount = bytes[cursor];
      cursor += 2; // level, enable
      if (levelCount > 64) {
        valid = false;
        break;
      }
      cursor += levelCount * (1 + 8 * valueSize);
      if (cursor > offset + frameLength) {
        valid = false;
        break;
      }
    }
    if (valid && cursor === offset + frameLength) return valueSize;
  }
  return null;
}

/**
 * Return true only for a complete v1 CARDCONNECTION_RECHARGE_LIST frame.
 *
 * LastRO also uses 0x0AD6 as a two-byte stream marker. The card-list packet
 * is length-prefixed, so validate the complete class/level layout before the
 * receiver treats 0x0AD6 as a business packet.
 */
export function isCardConnectionRechargeListFrame(buffer, offset = 0, packetver = 20180704) {
  return getCardConnectionRechargeListValueSize(buffer, offset, packetver) !== null;
}

/**
 * Classify the receive-loop action for a 0x0ad6 frame candidate.
 *
 * This keeps the buffering decision testable without loading the browser
 * bundle: a marker can be consumed immediately, a partial card frame must be
 * retained, and a complete structurally valid frame can be decoded.
 */
export function getCardConnectionRechargeListFrameDisposition(buffer, offset = 0, packetver = 20180704) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset + 2 > bytes.byteLength) return null;
  const id = bytes[offset] | (bytes[offset + 1] << 8);
  if (id !== CARD_CONNECTION_PACKET_IDS.rechargeList) return null;
  if (!isCardConnectionRechargeListCandidate(bytes, offset)) return { kind: "marker", frameLength: null };

  const frameLength = getCardConnectionRechargeListFrameLength(bytes, offset);
  if (frameLength === null || offset + frameLength > bytes.byteLength) {
    return { kind: "incomplete", frameLength };
  }
  return {
    kind: isCardConnectionRechargeListFrame(bytes, offset, packetver) ? "card" : "marker",
    frameLength
  };
}

export const CARD_CONNECTION_DB ={
		3 : {
			[0] : {//我的卡组
				enable: 0,
				data : {
					1:{
						cards: [0,0,0,0,0,0,0,0],
						recharge: [0,0,0,0,0,0,0,0],
					},
				}
			},
			[1] : {//头饰
				data : {
					1: {
						cards: [4010, 4039, 4041, 4046, 4052, 4087, 4110, 4112],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4122, 4127, 4132, 4143, 4148, 4161, 4169, 4177],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4185, 4188, 4195, 4198, 4206, 4223, 4229, 4241],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4258, 4260, 4261, 4269, 4271, 4278, 4288, 4296],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4311, 4330, 4336, 4343, 4354, 4357, 4358, 4364],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4365, 4366, 4372, 4374, 4379, 4403, 4411, 4412],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4434, 4438, 4458, 4459, 4460, 4461, 4468, 4506],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4509, 4512, 4513, 4517, 4524, 4528, 4529, 4530],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4545, 4549, 4555, 4556, 4557, 4582, 4583, 4586],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4597, 4598, 4599, 4600, 4623, 4650, 4668, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[2] : {//铠甲
				data : {
					1: {
						cards: [4001, 4003, 4008, 4011, 4014, 4016, 4021, 4023],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4031, 4042, 4047, 4054, 4061, 4078, 4089, 4098],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4099, 4101, 4105, 4114, 4119, 4135, 4141, 4150],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4158, 4162, 4166, 4170, 4173, 4181, 4189, 4191],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4194, 4201, 4213, 4216, 4218, 4220, 4222, 4233],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4234, 4242, 4243, 4259, 4270, 4279, 4280, 4286],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4295, 4298, 4299, 4300, 4301, 4302, 4315, 4324],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4332, 4333, 4337, 4338, 4339, 4342, 4346, 4353],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4363, 4369, 4370, 4371, 4382, 4383, 4386, 4387],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4392, 4393, 4400, 4401, 4404, 4405, 4408, 4409],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [4410, 4419, 4426, 4450, 4451, 4456, 4457, 4462],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					12: {
						cards: [4516, 4523, 4526, 4527, 4534, 4547, 4553, 4560],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					13: {
						cards: [4561, 4562, 4563, 4564, 4565, 4566, 4585, 4590],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					14: {
						cards: [4591, 4592, 4601, 4602, 4605, 4610, 4635, 4638],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					15: {
						cards: [4651, 4652, 4659, 4664, 4666, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[3] : {//武器
				data : {
					1: {
						cards: [4002, 4004, 4005, 4006, 4007, 4017, 4018, 4019],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4020, 4024, 4025, 4026, 4029, 4030, 4035, 4037],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4043, 4049, 4055, 4057, 4060, 4062, 4063, 4065],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4068, 4069, 4072, 4076, 4080, 4082, 4085, 4086],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4092, 4094, 4096, 4104, 4106, 4111, 4115, 4117],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4118, 4121, 4125, 4126, 4130, 4134, 4137, 4140],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4142, 4147, 4153, 4155, 4156, 4157, 4163, 4165],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4167, 4171, 4172, 4176, 4180, 4182, 4184, 4192],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4202, 4203, 4214, 4225, 4246, 4247, 4251, 4255],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4263, 4268, 4273, 4274, 4276, 4281, 4284, 4289],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [4291, 4292, 4297, 4305, 4307, 4308, 4310, 4312],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					12: {
						cards: [4316, 4317, 4318, 4320, 4323, 4329, 4335, 4341],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					13: {
						cards: [4345, 4350, 4360, 4361, 4362, 4367, 4368, 4380],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					14: {
						cards: [4388, 4390, 4394, 4395, 4398, 4399, 4406, 4407],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					15: {
						cards: [4421, 4425, 4427, 4428, 4440, 4446, 4452, 4453],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					16: {
						cards: [4454, 4455, 4463, 4464, 4465, 4466, 4469, 4470],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					17: {
						cards: [4471, 4472, 4473, 4474, 4475, 4476, 4477, 4507],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					18: {
						cards: [4510, 4511, 4514, 4518, 4519, 4521, 4522, 4531],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					19: {
						cards: [4533, 4546, 4550, 4551, 4574, 4575, 4578, 4579],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					20: {
						cards: [4584, 4603, 4604, 4607, 4608, 4625, 4626, 4627],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					21: {
						cards: [4633, 4634, 4649, 4654, 4655, 4665, 4669, 4670],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					22: {
						cards: [4684, 4685, 4686, 4687, 4688, 4689, 4690, 4691],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					23: {
						cards: [4692, 4693, 4694, 4695, 4696, 4697, 4698, 4699],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[4] : {//盾牌
				data : {
					1: {
						cards: [4012, 4013, 4032, 4045, 4058, 4059, 4066, 4067],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4074, 4075, 4083, 4090, 4120, 4124, 4128, 4136],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4138, 4146, 4207, 4217, 4226, 4231, 4240, 4248],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4250, 4254, 4277, 4304, 4309, 4314, 4322, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4340, 4397, 4414, 4420, 4439, 4442, 4443, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4444, 4445, 4447, 4448, 4449, 4515, 4609, 4628],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4636, 4641, 4653, 4660, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[5] : {//披肩
				data : {
					1: {
						cards: [4015, 4056, 4071, 4081, 4088, 4095, 4102, 4108],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4109, 4113, 4116, 4129, 4133, 4159, 4174, 4178],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4179, 4183, 4197, 4210, 4211, 4266, 4285, 4287],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4303, 4306, 4313, 4325, 4328, 4334, 4351, 4359],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4373, 4375, 4402, 4422, 4429, 4431, 4432, 4479],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4520, 4525, 4548, 0, 4558, 4567, 4568, 4569],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4570, 4571, 4572, 4573, 4576, 4580, 4588, 4589],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4593, 4594, 4595, 4596, 4606, 4629, 4637, 4646],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4657, 4662, 4671, 4672, 4673, 4674, 4675, 4676],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4677, 4678, 4679, 4680, 4681, 4682, 4683, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[6] : {//鞋类
				data : {
					1: {
						cards: [4009, 4038, 4050, 4070, 4097, 4100, 4107, 4123],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4131, 4151, 4160, 4164, 4168, 4186, 4199, 4200],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4204, 4208, 4221, 4235, 4236, 4239, 4244, 4245],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4249, 4257, 4267, 4275, 4290, 4319, 4352, 4376],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4378, 4381, 4396, 4417, 4435, 4441, 4467, 4478],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4532, 4581, 4630, 4642, 4643, 4644, 4645, 4648],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4656, 4658, 4663, 4667, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[7] : {//饰品
				data : {
					1: {
						cards: [4022, 4027, 4028, 4033, 4034, 4036, 4040, 4044],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4048, 4051, 4053, 4064, 4073, 4077, 4079, 4084],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4091, 4093, 4103, 4139, 4144, 4145, 4149, 4152],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4154, 4175, 4187, 4190, 4193, 4196, 4205, 4209],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4212, 4215, 4219, 4224, 4227, 4228, 4230, 4232],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4237, 4238, 4252, 4256, 4262, 4264, 4265, 4272],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4282, 4283, 4293, 4294, 4321, 4326, 4327, 4331],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4344, 4347, 4348, 4349, 4355, 4356, 4377, 4384],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4385, 4389, 4391, 4415, 4416, 4418, 4423, 4424],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4430, 4433, 4436, 4437, 4505, 4508, 4552, 4577],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [4587, 4631, 4632, 4639, 4640, 4647, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			}
		},
		5 : {
			[0] : {//我的卡组
				enable: 0,
				data : {
					1:{
						cards: [0,0,0,0,0,0,0,0],
						recharge: [0,0,0,0,0,0,0,0],
					},
				}
			},
			[1] : {//头饰
				data : {
					1: {
						cards: [4010, 4039, 4041, 4046, 4052, 4087, 4110, 4112],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4122, 4127, 4132, 4143, 4148, 4161, 4169, 4177],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4185, 4188, 4195, 4198, 4206, 4223, 4229, 4241],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4258, 4260, 4261, 4269, 4271, 4278, 4288, 4296],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4311, 4330, 4336, 4343, 4354, 4357, 4358, 4364],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4365, 4366, 4372, 4374, 4379, 4403, 4411, 4412],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4434, 4438, 4458, 4459, 4460, 4461, 4468, 4506],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4509, 4512, 4513, 4517, 4524, 4528, 4529, 4530],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [0, 0, 0, 4556, 4557, 4582, 4583, 4586],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4597, 4598, 4599, 4600, 27109, 4650, 4668, 27030],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [27115, 27123, 27124, 0, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[2] : {//铠甲
				data : {
					1: {
						cards: [4001, 4003, 4008, 4011, 4014, 4016, 4021, 4023],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4031, 4042, 4047, 4054, 4061, 4078, 4089, 4098],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4099, 4101, 4105, 4114, 4119, 4135, 4141, 4150],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4158, 4162, 4166, 4170, 4173, 4181, 4189, 4191],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4194, 4201, 4213, 4216, 4218, 4220, 4222, 4233],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4234, 4242, 4243, 4259, 4270, 4279, 4280, 4286],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4295, 4298, 4299, 4300, 4301, 4302, 4315, 4324],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4332, 4333, 4337, 4338, 4339, 4342, 4346, 4353],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4363, 4369, 4370, 4371, 4382, 4383, 4386, 4387],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4392, 4393, 4400, 4401, 4404, 4405, 4408, 4409],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [4410, 4419, 4426, 4450, 4451, 4456, 4457, 4462],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					12: {
						cards: [4516, 4523, 4526, 4527, 4534, 4547, 0, 4560],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					13: {
						cards: [4561, 4562, 4563, 4564, 4565, 4566, 4585, 4590],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					14: {
						cards: [4591, 4592, 4601, 4602, 4605, 4610, 4635, 4638],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					15: {
						cards: [4651, 4652, 4659, 4664, 4666, 27027, 27081, 27082],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					16: {
						cards: [27083, 27084, 27110, 27112, 27113, 27114, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[3] : {//武器
				data : {
					1: {
						cards: [4002, 4004, 4005, 4006, 4007, 4017, 4018, 4019],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4020, 4024, 4025, 4026, 4029, 4030, 4035, 4037],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4043, 4049, 4055, 4057, 4060, 4062, 4063, 4065],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4068, 4069, 4072, 4076, 4080, 4082, 4085, 4086],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4092, 4094, 4096, 4104, 4106, 4111, 4115, 4117],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4118, 4121, 4125, 4126, 4130, 4134, 4137, 4140],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4142, 4147, 4153, 4155, 4156, 4157, 4163, 4165],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4167, 4171, 4172, 4176, 4180, 4182, 4184, 4192],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4202, 4203, 4214, 4225, 4246, 4247, 4251, 4255],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4263, 4268, 4273, 4274, 4276, 4281, 4284, 4289],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [4291, 4292, 4297, 4305, 4307, 4308, 4310, 4312],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					12: {
						cards: [4316, 4317, 4318, 4320, 4323, 4329, 4335, 4341],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					13: {
						cards: [4345, 4350, 4360, 4361, 4362, 4367, 4368, 4380],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					14: {
						cards: [4388, 4390, 4394, 4395, 4398, 4399, 4406, 4407],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					15: {
						cards: [4421, 4425, 4427, 4428, 4440, 4446, 4452, 4453],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					16: {
						cards: [4454, 4455, 4463, 4464, 4465, 4466, 4469, 4470],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					17: {
						cards: [4471, 4472, 4473, 4474, 4475, 4476, 4477, 4507],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					18: {
						cards: [4510, 4511, 4514, 4518, 4519, 4521, 4522, 4531],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					19: {
						cards: [4533, 4546, 4550, 4551, 4574, 4575, 4578, 4579],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					20: {
						cards: [4584, 4603, 4604, 4607, 4608, 4625, 4626, 4627],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					21: {
						cards: [4633, 4634, 4649, 4654, 4655, 4665, 4669, 4670],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					22: {
						cards: [27028, 27085, 27086, 27117, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[4] : {//盾牌
				data : {
					1: {
						cards: [4012, 4013, 4032, 4045, 4058, 4059, 4066, 4067],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4074, 4075, 4083, 4090, 4120, 4124, 4128, 4136],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4138, 4146, 4207, 4217, 4226, 4231, 4240, 4248],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4250, 4253, 4254, 4277, 4304, 4309, 4314, 4322],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4340, 4397, 4413, 4414, 4420, 4439, 4442, 4443],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4444, 4445, 4447, 4448, 4449, 4515, 4609, 4628],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4636, 4641, 4653, 4660, 4661, 27029, 27118, 27119],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[5] : {//披肩
				data : {
					1: {
						cards: [4015, 4056, 4071, 4081, 4088, 4095, 4102, 4108],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4109, 4113, 4116, 4129, 4133, 4159, 4174, 4178],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4179, 4183, 4197, 4210, 4211, 4266, 4285, 4287],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4303, 4306, 4313, 4325, 4328, 4334, 4351, 4359],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4373, 4375, 4402, 4422, 4429, 4431, 4432, 4479],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4520, 4525, 4548, 4554, 4558, 4567, 4568, 4569],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4570, 4571, 4572, 4573, 4576, 4580, 4588, 4589],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4593, 4594, 4595, 4596, 4606, 4629, 4637, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4657, 4662, 0, 0, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[6] : {//鞋类
				data : {
					1: {
						cards: [4009, 4038, 4050, 4070, 4097, 4100, 4107, 4123],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4131, 4151, 4160, 4164, 4168, 4186, 4199, 4200],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4204, 4208, 4221, 4235, 4236, 4239, 4244, 4245],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4249, 4257, 4267, 4275, 4290, 4319, 4352, 4376],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4378, 4381, 4396, 4417, 4435, 4441, 4467, 4646],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4532, 4581, 4630, 4642, 4643, 4644, 4645, 4648],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4656, 4658, 4663, 4667, 27118, 27121, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			},
			[7] : {//饰品
				data : {
					1: {
						cards: [4022, 4027, 4028, 4033, 4034, 4036, 4040, 4044],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					2: {
						cards: [4048, 4051, 4053, 4064, 4073, 4077, 4079, 4084],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					3: {
						cards: [4091, 4093, 4103, 4139, 4144, 4145, 4149, 4152],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					4: {
						cards: [4154, 4175, 4187, 4190, 4193, 4196, 4205, 4209],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					5: {
						cards: [4212, 4215, 4219, 4224, 4227, 4228, 4230, 4232],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					6: {
						cards: [4237, 4238, 4252, 4256, 4262, 4264, 4265, 4272],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					7: {
						cards: [4282, 4283, 4293, 4294, 4321, 4326, 4327, 4331],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					8: {
						cards: [4344, 4347, 4348, 4349, 4355, 4356, 4377, 4384],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					9: {
						cards: [4385, 4389, 4391, 4415, 4416, 4418, 4423, 4424],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					10: {
						cards: [4430, 4433, 4436, 4437, 4505, 4508, 0, 4577],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					11: {
						cards: [27026, 4631, 4632, 4639, 4640, 4647, 27107, 27108],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					12: {
						cards: [27111, 27116, 27120, 0, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0],
					},
				}
			}
		},
		6 : {
			[0] : {//我的卡组
				enable: 0,
				data : {
					1:{
						cards: [0,0,0,0,0,0,0,0],
						recharge: [0,0,0,0,0,0,0,0],
					},
				}
			},
			[1] : {//头饰
				data : {
					1: {
						cards: [4010, 4039, 4041, 4046, 4052, 4087, 4110, 4112],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4122, 4127, 4132, 4143, 4148, 4161, 4169, 4177],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4185, 4188, 4195, 4198, 4206, 4223, 4229, 4241],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4258, 4260, 4261, 4269, 4271, 4278, 4288, 4296],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4311, 4330, 4336, 4343, 4354, 4357, 4358, 4364],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					6: {
						cards: [4365, 4366, 4372, 4374, 4379, 4403, 4411, 4412],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					7: {
						cards: [4434, 4438, 0, 0, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[2] : {//铠甲
				data : {
					1: {
						cards: [4001, 4003, 4008, 4011, 4014, 4016, 4021, 4023],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4031, 4042, 4047, 4054, 4061, 4078, 4089, 4098],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4099, 4101, 4105, 4114, 4119, 4135, 4141, 4150],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4158, 4162, 4166, 4170, 4173, 4181, 4189, 4191],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4194, 4201, 4213, 4216, 4218, 4220, 4222, 4233],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					6: {
						cards: [4234, 4242, 4243, 4259, 4270, 4279, 4280, 4286],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					7: {
						cards: [4295, 4298, 4299, 4300, 4301, 4302, 4315, 4324],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					8: {
						cards: [4332, 4333, 4337, 4338, 4339, 4342, 4346, 4353],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					9: {
						cards: [4363, 4369, 4370, 4371, 4382, 4383, 4386, 4387],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					10: {
						cards: [4392, 4393, 4400, 4401, 4404, 4405, 4408, 4409],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					11: {
						cards: [4410, 4419, 4426, 4450, 4451, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[3] : {//武器
				data : {
					1: {
						cards: [4002, 4004, 4005, 4006, 4007, 4017, 4018, 4019],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4020, 4024, 4025, 4026, 4029, 4030, 4035, 4037],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4043, 4049, 4055, 4057, 4060, 4062, 4063, 4065],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4068, 4069, 4072, 4076, 4080, 4082, 4085, 4086],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4092, 4094, 4096, 4104, 4106, 4111, 4115, 4117],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					6: {
						cards: [4118, 4121, 4125, 4126, 4130, 4134, 4137, 4140],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					7: {
						cards: [4142, 4147, 4153, 4155, 4156, 4157, 4163, 4165],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					8: {
						cards: [4167, 4171, 4172, 4176, 4180, 4182, 4184, 4192],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					9: {
						cards: [4202, 4203, 4214, 4225, 4246, 4247, 4251, 4255],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					10: {
						cards: [4263, 4268, 4273, 4274, 4276, 4281, 4284, 4289],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					11: {
						cards: [4291, 4292, 4297, 4305, 4307, 4308, 4310, 4312],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					12: {
						cards: [4316, 4317, 4318, 4320, 4323, 4329, 4335, 4341],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					13: {
						cards: [4345, 4350, 4360, 4361, 4362, 4367, 4368, 4380],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					14: {
						cards: [4388, 4390, 4394, 4395, 4398, 4399, 4406, 4407],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					15: {
						cards: [4421, 4425, 4427, 4428, 4440, 4446, 4452, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[4] : {//盾牌
				data : {
					1: {
						cards: [4012, 4013, 4032, 4045, 4058, 4059, 4066, 4067],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4074, 4075, 4083, 4090, 4120, 4124, 4128, 4136],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4138, 4146, 4207, 4217, 4226, 4231, 4240, 4248],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4250, 4253, 4254, 4277, 4304, 4309, 4314, 4322],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4340, 4397, 4413, 4414, 4420, 4439, 4442, 4443],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					6: {
						cards: [4444, 4445, 4447, 4448, 4449, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[5] : {//披肩
				data : {
					1: {
						cards: [4015, 4056, 4071, 4081, 4088, 4095, 4102, 4108],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4109, 4113, 4116, 4129, 4133, 4159, 4174, 4178],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4179, 4183, 4197, 4210, 4211, 4266, 4285, 4287],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4303, 4306, 4313, 4325, 4328, 4334, 4351, 4359],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4373, 4375, 4402, 4422, 4429, 4431, 4432, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[6] : {//鞋类
				data : {
					1: {
						cards: [4009, 4038, 4050, 4070, 4097, 4100, 4107, 4123],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4131, 4151, 4160, 4164, 4168, 4186, 4199, 4200],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4204, 4208, 4221, 4235, 4236, 4239, 4244, 4245],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4249, 4257, 4267, 4275, 4290, 4319, 4352, 4376],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4378, 4381, 4396, 4417, 4435, 4441, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			},
			[7] : {//饰品
				data : {
					1: {
						cards: [4022, 4027, 4028, 4033, 4034, 4036, 4040, 4044],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					2: {
						cards: [4048, 4051, 4053, 4064, 4073, 4077, 4079, 4084],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					3: {
						cards: [4091, 4093, 4103, 4139, 4144, 4145, 4149, 4152],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					4: {
						cards: [4154, 4175, 4187, 4190, 4193, 4196, 4205, 4209],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					5: {
						cards: [4212, 4215, 4219, 4224, 4227, 4228, 4230, 4232],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					6: {
						cards: [4237, 4238, 4252, 4256, 4262, 4264, 4265, 4272],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					7: {
						cards: [4282, 4283, 4293, 4294, 4321, 4326, 4327, 4331],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					8: {
						cards: [4344, 4347, 4348, 4349, 4355, 4356, 4377, 4384],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					9: {
						cards: [4385, 4389, 4391, 4415, 4416, 4418, 4423, 4424],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
					10: {
						cards: [4430, 4433, 4436, 4437, 0, 0, 0, 0],
						recharge: [0, 0, 0, 0, 0, 0, 0, 0]
					},
				}
			}
		}
	};

function normalizeClass(classInfo = {}) {
  const data = {};
  for (const [level, levelInfo] of Object.entries(classInfo.data || {})) {
    const cards = Array.isArray(levelInfo.cards) ? levelInfo.cards.map((id) => Number(id) || 0) : [];
    const recharge = Array.isArray(levelInfo.recharge) ? levelInfo.recharge.map((state) => Number(state) || 0) : [];
    while (recharge.length < cards.length) recharge.push(0);
    data[level] = {
      cards,
      recharge,
      effect: typeof levelInfo.effect === "string" ? levelInfo.effect : "",
      activate: Number(levelInfo.activate) || 0
    };
  }
  return { enable: Number(classInfo.enable) || 0, data };
}

export function getCardConnectionData(nid) {
  const source = CARD_CONNECTION_DB[nid] || CARD_CONNECTION_DB[3] || Object.values(CARD_CONNECTION_DB)[0];
  if (!source) return null;
  return {
    enable: 0,
    data: Object.fromEntries(Object.entries(source).map(([tab, classInfo]) => [tab, normalizeClass(classInfo)]))
  };
}

function resolveCardName(itemNames, id) {
  if (typeof itemNames === "function") {
    try {
      const value = itemNames(id);
      if (value !== undefined && value !== null && String(value).trim()) return String(value);
    } catch {
      // Fall back to the numeric ID when the item database is not ready yet.
    }
  } else if (itemNames && Object.prototype.hasOwnProperty.call(itemNames, id)) {
    const value = itemNames[id];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return String(id);
}

export function listCardEntries(data, { tab = 1, page = 1, pageSize = 8, filter = "all", search = "", itemNames = {}, searchAllTabs = false, level = null } = {}) {
  const tabId = Number(tab);
  const searchText = String(search || "").trim().toLowerCase();
  const levelId = Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null;
  const tabIds = searchText && searchAllTabs
    ? Object.keys(data?.data || {}).map(Number).filter((id) => Number.isFinite(id))
    : [tabId];
  const entries = [];
  for (const currentTabId of tabIds) {
    const source = data?.data?.[currentTabId];
    if (!source) continue;
    for (const [levelKey, levelInfo] of Object.entries(source.data || {})) {
      if (levelId !== null && Number(levelKey) !== levelId) continue;
      const cards = Array.isArray(levelInfo.cards) ? levelInfo.cards : [];
      const recharge = Array.isArray(levelInfo.recharge) ? levelInfo.recharge : [];
      for (let index = 0; index < cards.length; index++) {
        const id = Number(cards[index]) || 0;
        if (!id) continue;
        const state = Number(recharge[index]) || 0;
        const name = resolveCardName(itemNames, id);
        if (filter === "charged" && state <= 0) continue;
        if (filter === "can-charge" && state !== 0) continue;
        if (searchText && !String(id).includes(searchText) && !name.toLowerCase().includes(searchText)) continue;
        entries.push({ id, tab: currentTabId, level: Number(levelKey), slot: index, state, name, effect: levelInfo.effect || "" });
      }
    }
  }
  const size = Math.max(1, Number(pageSize) || 8);
  const totalPages = Math.max(1, Math.ceil(entries.length / size));
  const currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (currentPage - 1) * size;
  return { entries: entries.slice(start, start + size), page: currentPage, totalPages, total: entries.length };
}

export const CARD_DECK_TAB = 0;
export const CARD_DECK_LEVEL = 1;
export const CARD_DECK_CAPACITY = 8;

/**
 * Locate the category/level/slot where a card id is defined.
 * Returns null for unknown ids (e.g. cards missing from the static table).
 */
export function findCardDefinition(data, cardid) {
  const wanted = Number(cardid) || 0;
  if (!wanted || !data?.data) return null;
  for (const [tabKey, source] of Object.entries(data.data)) {
    const tab = Number(tabKey);
    if (tab === CARD_DECK_TAB) continue;
    for (const [levelKey, levelInfo] of Object.entries(source?.data || {})) {
      const cards = Array.isArray(levelInfo.cards) ? levelInfo.cards : [];
      const slot = cards.findIndex((id) => (Number(id) || 0) === wanted);
      if (slot >= 0) {
        const recharge = Array.isArray(levelInfo.recharge) ? levelInfo.recharge : [];
        return { tab, level: Number(levelKey), slot, state: Number(recharge[slot]) || 0 };
      }
    }
  }
  return null;
}

/**
 * Build the "My Deck" overview: the eight deck slots plus every charged card
 * (state === 1) that has not been added to the deck yet. The deck packet only
 * carries in-deck card ids, so charged-but-inactive cards are aggregated from
 * the equipment categories here.
 */
export function getCardDeckOverview(data, { itemNames = {}, search = "" } = {}) {
  const searchText = String(search || "").trim().toLowerCase();
  const deckLevel = data?.data?.[CARD_DECK_TAB]?.data?.[CARD_DECK_LEVEL];
  const deckCards = Array.isArray(deckLevel?.cards) ? deckLevel.cards : [];
  const deck = [];
  const deckIds = new Set();
  for (let slot = 0; slot < CARD_DECK_CAPACITY; slot++) {
    const id = Number(deckCards[slot]) || 0;
    if (!id) continue;
    deckIds.add(id);
    const definition = findCardDefinition(data, id);
    deck.push({
      slot,
      id,
      name: resolveCardName(itemNames, id),
      tab: definition?.tab ?? CARD_DECK_TAB,
      level: definition?.level ?? CARD_DECK_LEVEL,
      state: definition?.state || 2
    });
  }

  const awaiting = [];
  for (const [tabKey, source] of Object.entries(data?.data || {})) {
    const tab = Number(tabKey);
    if (tab === CARD_DECK_TAB) continue;
    for (const [levelKey, levelInfo] of Object.entries(source?.data || {})) {
      const cards = Array.isArray(levelInfo.cards) ? levelInfo.cards : [];
      const recharge = Array.isArray(levelInfo.recharge) ? levelInfo.recharge : [];
      for (let index = 0; index < cards.length; index++) {
        const id = Number(cards[index]) || 0;
        if (!id || Number(recharge[index]) !== 1 || deckIds.has(id)) continue;
        const name = resolveCardName(itemNames, id);
        if (searchText && !String(id).includes(searchText) && !name.toLowerCase().includes(searchText)) continue;
        awaiting.push({ id, name, tab, level: Number(levelKey), slot: index, state: 1 });
      }
    }
  }

  return {
    deck,
    awaiting,
    deckCount: deck.length,
    capacity: CARD_DECK_CAPACITY,
    activate: Number(deckLevel?.activate) || 0,
    enable: Number(data?.data?.[CARD_DECK_TAB]?.enable) || 0
  };
}

/** Number of level rows advertised for a category tab. */
export function getCardLevelCount(data, tab) {
  const source = data?.data?.[Number(tab)];
  if (!source?.data) return 0;
  return Object.keys(source.data).length;
}

export function buildCardConnectionAction(action, { tab = 0, level = 0, cardid = 0 } = {}) {
  const key = String(action || "");
  const id = CARD_CONNECTION_PACKET_IDS[key === "add-deck" ? "addDeck" : key];
  if (!id) throw new Error(`unknown card collection action: ${key}`);
  const result = { id, tab: Number(tab) || 0, level: Number(level) || 0 };
  if (["recharge", "add-deck", "cancel"].includes(key)) result.cardid = Number(cardid) || 0;
  return result;
}

export function applyCardConnectionUpdate(data, update = {}) {
  const tab = data?.data?.[update.tab];
  const level = tab?.data?.[update.level];
  if (!level) return false;
  const index = level.cards.indexOf(Number(update.cardid));
  if (index < 0) return false;
  level.recharge[index] = Number(update.state) || 0;
  if (Number(update.state) === 2) {
    const deck = data.data[0]?.data?.[1]?.cards || [];
    const slot = deck.indexOf(0);
    if (slot >= 0) deck[slot] = Number(update.cardid);
  }
  return true;
}

export function applyCardConnectionCancelUpdate(data, update = {}) {
  const tab = data?.data?.[update.tab];
  const level = tab?.data?.[update.level];
  if (level) {
    const index = level.cards.indexOf(Number(update.cardid));
    if (index >= 0) level.recharge[index] = Number(update.state) || 0;
  }
  const deck = data?.data?.[0]?.data?.[1]?.cards || [];
  const index = deck.indexOf(Number(update.cardid));
  if (index >= 0) deck[index] = 0;
  return index >= 0;
}

export function applyCardConnectionActivateUpdate(data, update = {}) {
  const level = data?.data?.[update.tab]?.data?.[update.level];
  if (!level) return false;
  level.activate = Number(update.state) ? 1 : 0;
  return true;
}

export function applyCardConnectionEnableUpdate(data, update = {}) {
  if (!data) return false;
  data.enable = Number(update.state ?? update.enable) ? 1 : 0;
  return true;
}
