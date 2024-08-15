#pragma once
#include <stdint.h>
#include <type_traits>
#include <initializer_list>

/*
 * This file is part of the CitizenFX project - http://citizen.re/
 *
 * See LICENSE and MENTIONS in the root of the source tree for information
 * regarding licensing.
 *
 * https://github.com/citizenfx/fivem/blob/master/code/client/shared/Hooking.h
 */

namespace hook
{
	template<typename T>
	inline T get_call(T address)
	{
		intptr_t target = *(intptr_t*)((uintptr_t)address + 1);
		target += ((uintptr_t)address + 5);

		return (T)target;
	}

	template<typename T, typename TAddr>
	inline T get_address(TAddr address)
	{
		intptr_t target = *(int32_t*)(uintptr_t)address;
		target += ((uintptr_t)address + 4);

		return (T)target;
	}

	template<typename ValueType, typename AddressType>
	inline void put(AddressType address, ValueType value)
	{
		memcpy((void*)address, &value, sizeof(value));
	}

	template<typename AddressType>
	inline void nop(AddressType address, size_t length)
	{
		memset((void*)address, 0x90, length);
	}

	void* AllocateFunctionStub(void *origin, void *function, int type);

	template<typename T>
	struct get_func_ptr
	{
		static void* get(T func)
		{
			return (void*)func;
		}
	};

	template<int Register, typename T, typename AT>
	inline std::enable_if_t<(Register < 8 && Register >= 0)> jump_reg(AT address, T func)
	{
		LPVOID funcStub = AllocateFunctionStub((void*)GetModuleHandle(NULL), get_func_ptr<T>::get(func), Register);

		put<uint8_t>(address, 0xE9);
		put<int>((uintptr_t)address + 1, (intptr_t)funcStub - (intptr_t)address - 5);
	}

	template<typename T, typename AT>
	inline void jump(AT address, T func)
	{
		jump_reg<0>(address, func);
	}

	template<typename T, typename AT>
	inline void jump_rcx(AT address, T func)
	{
		jump_reg<1>(address, func);
	}

	template<int Register, typename T, typename AT>
	inline std::enable_if_t<(Register < 8 && Register >= 0)> call_reg(AT address, T func)
	{
		LPVOID funcStub = AllocateFunctionStub((void*)GetModuleHandle(NULL), get_func_ptr<T>::get(func), Register);

		put<uint8_t>(address, 0xE8);
		put<int>((uintptr_t)address + 1, (intptr_t)funcStub - (intptr_t)address - 5);
	}

	template<typename T, typename AT>
	inline void call(AT address, T func)
	{
		call_reg<0>(address, func);
	}
	
	template<typename T, typename AT>
	inline void call_rcx(AT address, T func)
	{
		call_reg<1>(address, func);
	}

	template<size_t TotalNumBytes>
	inline void patch_and_nop_remaining(void* address, std::initializer_list<uint8_t> patch)
	{
		memcpy(address, patch.begin(), patch.size());
		if (patch.size() != TotalNumBytes)
		{
			hook::nop((uintptr_t)address + patch.size(), TotalNumBytes - patch.size());
		}
	}
}